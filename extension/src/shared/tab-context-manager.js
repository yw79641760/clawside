// ClawSide - Unified Tab Context Manager
// Single source of truth for all tab page contexts.
// Works in both content script context (popup/dock) and side panel context.
//
// Data flow:
//   Content script  → writes to chrome.storage.local['_tabCtxData']
//   Side panel      → reads from chrome.storage.local, listens for onChanged
//
// chrome.storage.local keys:
//   _tabCtxData    → { contexts: { tabId: TabContext }, activeTabId: number, lruOrder: string[] }
//   _tabCtxVersion  → incrementing counter to debounce rapid writes
//
// Exposed: window.tabContextManager
//   .init()                       — wire listeners (content: Chrome APIs; side panel: storage watcher)
//   .get(tabId)                  — get context (null if not cached)
//   .getCurrent()                 — get context for the currently active tab
//   .set(tabId, ctx)             — set/update context (content script only: writes to storage)
//   .setSelectedText(text)        — update selectedText for active tab
//   .syncFromStorage(data)        — bulk sync from storage (side panel reads this)
//   .size() / .lruSize()         — debug stats

(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  var MAX_MAP_SIZE  = 50;
  var MAX_LRU_SIZE  = 10;

  // ── Storage keys ────────────────────────────────────────────────────────────
  var STORAGE_KEY    = '_tabCtxData';
  var VERSION_KEY    = '_tabCtxVersion';

  // ── TabContext structure ────────────────────────────────────────────────────
  function TabContext(url, title, content, selectedText, favicon) {
    this.url         = url          || '';
    this.title       = title        || '';
    this.content     = content      || '';
    this.selectedText = selectedText || '';
    this.favicon     = favicon      || '';
    this.lastAccessed = Date.now();
  }
  TabContext.prototype.touch = function () {
    this.lastAccessed = Date.now();
  };
  TabContext.prototype.toJSON = function () {
    // chrome.storage serialises .toJSON() if present
    return {
      url:          this.url,
      title:        this.title,
      content:      this.content,
      selectedText: this.selectedText,
      favicon:     this.favicon,
      lastAccessed: this.lastAccessed,
    };
  };

  // ── In-memory Map + LRU (using ContextLRUCache) ─────────────────────────────
  // Use ContextLRUCache for LRU management with dual-size limits
  var map = new window.ContextLRUCache({
    maxMapSize: MAX_MAP_SIZE,
    maxLruSize: MAX_LRU_SIZE
  });

  // ── Module State ───────────────────────────────────────────────────────────
  var activeTabId = null;
  var initialized = false;
  var isContentScript = false; // true when running in content script context

  // Debounce: skip if version hasn't changed
  var lastKnownVersion = null;

  // ── Storage Persistence ──────────────────────────────────────────────────────
  // Content script only: write full state + increment version so side panel's
  // storage.onChanged listener fires. Both keys updated in a single call so
  // Chrome delivers a single onChanged event.
  function persist() {
    if (!isContentScript) return;
    var version = Date.now(); // monotonic-ish timestamp
    var data = {
      contexts:    map.toJSON(),
      activeTabId: activeTabId,
      lruOrder:    map.lruKeys,
      _version:    version,
    };
    chrome.storage.local.set({ _tabCtxData: data, _tabCtxVersion: version }).catch(function () {});
  }

  // ── Page Content Extraction ─────────────────────────────────────────────────
  // Two implementations sharing the same Readability-based logic:
  //
  // extractPageContextInline() — content script: direct DOM access, Readability
  //                             already loaded via manifest content_scripts entry.
  // extractPageContext        — side panel via executeScript: self-contained
  //                             IIFE that injects Readability + runs extraction.
  //
  // Both MUST remain separate — executeScript serializes the function without
  // closure, so all dependencies must be embedded in the injected script body.
  //
  // The Readability IIFE (lib/readability.iife.js) sets window.Readability.

  // Content script: runs in the content script's JS context (has direct DOM access).
  // Readability is pre-loaded via manifest content_scripts list, available as
  // window.Readability. We clone the document to avoid Readability mutating the live DOM.
  function extractPageContextInline() {
    try {
      if (typeof Readability === 'undefined') return { content: '', jsonLd: '' };
      var clone = document.cloneNode(true);
      var reader = new Readability(clone);
      var article = reader.parse();
      var text = (article ? article.textContent : '') || '';

      // Extract JSON-LD structured data
      var jsonLdText = '';
      try {
        var ldScripts = clone.querySelectorAll('script[type="application/ld+json"]');
        var parts = [];
        Array.prototype.slice.call(ldScripts).forEach(function (script) {
          try {
            var data = JSON.parse(script.textContent);
            var items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
            items.forEach(function (item) {
              if (!item) return;
              var fields = ['headline', 'name', 'articleBody', 'text', 'contentText',
                            'description', 'summary', 'author', 'creator', 'publisher',
                            'datePublished', 'dateCreated', 'dateModified'];
              var extracted = [];
              fields.forEach(function (f) {
                if (item[f]) { var val = typeof item[f] === 'object' ? item[f].name || item[f] : item[f]; extracted.push(f + ': ' + val); }
              });
              if (extracted.length > 0) parts.push(extracted.join(', '));
            });
          } catch (e2) {}
        });
        if (parts.length > 0) jsonLdText = '\n[Structured Data]\n' + parts.join('\n');
      } catch (e1) {}

      return { content: text.trim().slice(0, 10000), jsonLd: jsonLdText };
    } catch (err) { return { content: '', jsonLd: '' }; }
  }

  // Side panel via executeScript: runs in the target tab's page context.
  // Self-contained IIFE — no closure variables (executeScript strips them).
  // Embeds the Readability library body inline so it is available in the page.
  function extractPageContext() {
    try {
      // ── Inline Readability (from lib/readability.iife.js, minified core) ──────
      // Readability source is embedded directly so executeScript can inject it.
      // Source: @mozilla/readability@0.5.0, IIFE-wrapped, comments stripped for size.
      // This block is replaced at build-time; on failure fall back to basic extraction.
      var _Readability = window.Readability;
      if (typeof _Readability !== 'function') {
        // Readability not available in page — fall back to basic text extraction
        var c = document.cloneNode(true);
        var noise = ['script','style','noscript','iframe','svg','nav','footer','aside',
          '.ad','.ads','.advert','.sidebar','#sidebar','.social','.share',
          '.comment','#comments','.pagination','.skip-link','.sr-only',
          '[hidden]','a[href^="#"]'];
        noise.forEach(function(s){try{Array.prototype.slice.call(c.querySelectorAll(s)).forEach(function(el){el.remove();});}catch(e){}});
        var raw = (c.innerText||'').trim();
        if(raw.length<200) raw=(c.textContent||'').trim();
        raw = raw.replace(/[\r\n]+/g,'\n').replace(/[ \t]+/g,' ').replace(/[\u200b-\u200f\u2028-\u202f]/g,'').trim();
        raw = raw.split('\n').filter(function(l){return l.trim().length>10;}).join('\n');
        raw = raw.replace(/^skip to[\s\S]*$/gim,'').replace(/^skip navigation[\s\S]*$/gim,'').trim();
        return {content: raw.slice(0,10000), jsonLd: ''};
      }

      var docClone = document.cloneNode(true);
      var parsed = new _Readability(docClone).parse();
      var text = (parsed ? parsed.textContent : '') || '';

      // JSON-LD extraction
      var jsonLdText = '';
      try {
        var scripts = docClone.querySelectorAll('script[type="application/ld+json"]');
        var parts = [];
        Array.prototype.slice.call(scripts).forEach(function(s){
          try{
            var d = JSON.parse(s.textContent);
            var items = Array.isArray(d) ? d : (d['@graph'] ? d['@graph'] : [d]);
            items.forEach(function(item){
              if(!item) return;
              var fields = ['headline','name','articleBody','text','contentText',
                'description','summary','author','creator','publisher',
                'datePublished','dateCreated','dateModified'];
              var ex = [];
              fields.forEach(function(f){
                if(item[f]){var v=typeof item[f]==='object'?item[f].name||item[f]:item[f];ex.push(f+': '+v);}
              });
              if(ex.length>0) parts.push(ex.join(', '));
            });
          }catch(e2){}
        });
        if(parts.length>0) jsonLdText = '\n[Structured Data]\n'+parts.join('\n');
      }catch(e1){}

      return { content: text.trim().slice(0, 10000), jsonLd: jsonLdText };
    } catch (err) { return { content: '', jsonLd: '' }; }
  }

  // ── Context Operations ───────────────────────────────────────────────────
  // tab param (optional): { id, url, title, favIconUrl } — passed directly from
  // bootstrap (via background response) or from chrome.tabs.query fallback.
  //
  // Content script bootstrap: calls setActiveTab(tabId, tab) with full tab object.
  // Side panel: calls setActiveTab(tabId) without tab — skips content extraction
  // (panel-context.js handles that separately via executeScript).
  // We detect "side panel context" by checking if window.location.protocol is
  // chrome-extension: — content scripts have the web page's protocol (http/https).
  async function setActiveTab(tabId, tab) {
    if (!tabId) return;
    activeTabId = tabId;
    try {
      var url, title, favicon, content = '';

      if (tab) {
        // Tab object passed directly (content script bootstrap — tab is current page tab).
        url     = tab.url         || '';
        title   = tab.title       || '';
        favicon = tab.favIconUrl  || '';
      } else {
        // No tab object — fetch via chrome.tabs.query.
        // In content script context: queries the web page tab.
        // In side panel context: queries the active tab in the browser.
        var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        tab = tabs && tabs[0];
        if (!tab) return;
        url     = tab.url         || '';
        title   = tab.title       || '';
        favicon = tab.favIconUrl  || '';
      }

      // Only extract page content in content script context (direct DOM access).
      // Side panel handles extraction via chrome.scripting.executeScript separately.
      var isWebPageProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
      if (isWebPageProtocol) {
        try {
          var extracted = extractPageContextInline();
          content = extracted.content + (extracted.jsonLd || '');
        } catch (e) {
          console.warn('[ClawSide] extractPageContextInline failed:', e.message || e);
        }
      }

      var existing = map.get(tabId);
      var selectedText = existing ? existing.selectedText : '';

      map.set(tabId, new TabContext(url, title, content, selectedText, favicon));
      persist();
    } catch (e) {
      console.warn('[ClawSide] setActiveTab failed:', e.message || e);
    }
  }

  function updateSelectedText(text) {
    if (!activeTabId) return;
    var ctx = map.get(activeTabId);
    if (ctx) {
      ctx.selectedText = text || '';
    } else {
      map.set(activeTabId, new TabContext('', '', '', text || '', ''));
    }
    persist();
  }

  // ── Content Script Listeners ─────────────────────────────────────────────────
  // All chrome.tabs.* listeners live in background.js (SW) — MV3 content scripts
  // cannot access chrome.tabs API. This function only wires message listeners
  // that receive tab events forwarded from the background.
  function wireContentScriptListeners() {

    // Tab activated / updated → update manager + re-extract content inline.
    chrome.runtime.onMessage.addListener(function (msg, sender, _sendResponse) {
      var tabId = msg && msg.tabId ? msg.tabId : (sender.tab && sender.tab.id);
      if (!tabId) return true;

      if (msg.type === 'tabctx-activated' || msg.type === 'tabctx-updated') {
        // Background sends { type, tabId, url, title, favicon }
        activeTabId = tabId;
        var url     = msg.url     || '';
        var title   = msg.title   || '';
        var favicon = msg.favicon || '';

        // Inline content extraction (no chrome.scripting needed in content script).
        var content = '';
        try {
          var extracted = extractPageContextInline();
          content = extracted.content + (extracted.jsonLd || '');
        } catch (e) {}

        var existing = map.get(tabId);
        var selectedText = existing ? existing.selectedText : '';

        map.set(tabId, new TabContext(url, title, content, selectedText, favicon));
        persist();
        return true;
      }

      if (msg.type === 'tabctx-removed') {
        map.delete(msg.tabId);
        persist();
        return true;
      }

      // text_selected — only updates selectedText, does NOT overwrite content/url/title.
      if (msg.type === 'text_selected' && tabId) {
        var ctx2 = map.get(tabId);
        if (ctx2) {
          ctx2.selectedText = msg.text || '';
          map.set(tabId, ctx2);
        } else {
          map.set(tabId, new TabContext(msg.url || '', msg.title || '', '', msg.text || '', ''));
        }
        persist();
        return true;
      }

      return true;
    });

    // Bootstrap: ask the background for the current active tab.
    // chrome.tabs is NOT available in MV3 content scripts — but chrome.runtime.sendMessage is.
    chrome.runtime.sendMessage({ type: 'get_current_tab' }, function (tabInfo) {
      if (tabInfo && tabInfo.id) {
        setActiveTab(tabInfo.id, tabInfo);
      }
    });
  }

  // ── Side Panel Listeners (storage-based) ────────────────────────────────────
  function wireSidePanelListeners() {
    // Re-read full state from storage on every change
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (!changes._tabCtxVersion) return;

      chrome.storage.local.get([STORAGE_KEY], function (result) {
        var data = result[STORAGE_KEY];
        if (!data) return;

        // Debounce: skip if this version is already in memory
        if (data._version === lastKnownVersion) return;
        lastKnownVersion = data._version;

        // Rebuild in-memory state
        if (data.contexts) map.fromJSON(data.contexts);
        if (data.activeTabId !== undefined) activeTabId = data.activeTabId;

        // Emit 'tabctx-updated' custom event so panel-context.js can react
        var evt = new CustomEvent('tabctx-updated', {
          detail: {
            tabId:      activeTabId,
            ctx:        map.get(activeTabId),
            allContexts: map.toJSON(),
          }
        });
        window.dispatchEvent(evt);
      });
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // @param {Function|null} ready  side panel only: callback fired after storage
  //                                 is loaded, BEFORE the Promise resolves. Caller
  //                                 can safely call updatePageContext() after await init().
  function init(ready) {
    if (initialized) return Promise.resolve();
    initialized = true;

    // Detect context: use chrome.runtime.getContexts (MV3) — reliable across all
    // execution contexts. Module-level `initialized` guard handles SW restarts.
    // NOTE: side panel TCM has its own JS context — initialized=false on each SW
    // startup, even if content script's TCM already ran in a previous session.
    isContentScript = typeof chrome.runtime.getContexts !== 'undefined'
      ? chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).length === 0
      : (typeof document !== 'undefined');

    if (isContentScript) {
      // Content script: wire Chrome tab listeners, persist to storage on every mutation
      wireContentScriptListeners();
      return Promise.resolve();
    } else {
      // Side panel: read from storage, listen for changes, emit CustomEvent
      wireSidePanelListeners();
      // Load initial state — return Promise so callers can await before using get()
      return new Promise(function (resolve) {
        chrome.storage.local.get([STORAGE_KEY], function (result) {
          var data = result[STORAGE_KEY];
          if (data) {
            if (data.contexts)    map.fromJSON(data.contexts);
            if (data.activeTabId !== undefined) activeTabId = data.activeTabId;
            lastKnownVersion = data._version || null;
          }
          // Fire ready BEFORE resolving — so callers can use manager immediately after await.
          if (ready) ready();
          resolve();
        });
      });
    }
  }

  // set() persists to storage only in content script context
  function set(tabId, ctx) {
    map.set(tabId, ctx);
    if (isContentScript) persist();
  }

  function get(tabId)           { return map.get(tabId); }
  function getCurrent()         { return activeTabId ? map.get(activeTabId) : null; }
  function getActiveTabId()     { return activeTabId; }

  function setActive(tabId)     { setActiveTab(tabId); }
  function setSelectedText(t)  { updateSelectedText(t); }
  // Lightweight: just update activeTabId without extracting content (used by panel to sync).
  function setActiveTabId(id) { activeTabId = id; }

  function size()               { return map.size; }
  function lruSize()          { return map.lruSize; }
  function isLRU(id)          { return map.isLru(id); }

  // Expose to other scripts in the same context
  window.tabContextManager = {
    init:                  init,
    get:                   get,
    getCurrent:            getCurrent,
    getActiveTabId:        getActiveTabId,
    set:                   set,
    setActive:             setActive,
    setSelectedText:       setSelectedText,
    setActiveTabId:        setActiveTabId,
    size:                  size,
    lruSize:               lruSize,
    isLRU:                 isLRU,
    // Exposed for use by panel-context.js (side panel UI layer)
    extractPageContext: extractPageContext,
    // Also expose inline version for panel-context's executeScript calls (same logic)
    _extractInline: extractPageContextInline,
  };

})();