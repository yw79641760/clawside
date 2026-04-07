// ClawSide - Panel Context
// Side panel's UI layer for the context box (favicon, title, URL, content preview).
// Delegates all tab context storage to src/shared/tab-context-manager.js.
//
// Context box display (always):
//   favicon + title + URL + content excerpt (first 25 chars of extractPageContext)
//   selectedText is kept SEPARATE — used only for translate tool input, never in the context box.
//
// Refresh button (bottom-right icon) triggers updatePageContext().
//
// Exposes: window.panelContext
//   .init(dom)                          - pass DOM element refs, wire listeners
//   .updatePageContext()                 - extract content from active tab + update DOM
//   .updateVisibility(activeTab)         - show/hide context box per tool tab
//   .getCurrentUrl() / getCurrentPageTitle() / getCurrentPageContent() / getSelectedText()
//   .setCurrentUrl / setCurrentPageTitle / setCurrentPageContent / setSelectedText

(function () {
  'use strict';

  // ── DOM Elements ─────────────────────────────────────────────
  let _el = {};
  const FALLBACK_FAVICON_PATH = 'assets/icons/icon16.png';
  const MIN_CONTENT_LENGTH = 100;

  function getFallbackFaviconUrl() {
    try {
      return chrome.runtime.getURL(FALLBACK_FAVICON_PATH);
    } catch {
      return FALLBACK_FAVICON_PATH;
    }
  }

  // ── DOM Init ─────────────────────────────────────────────────
  // @param {object} dom  { panelContext, ctxFavicon, ctxTitle, ctxUrl, ctxSelectedText,
  //                        ctxContentPreview, ctxHeadingSummarize, ctxHeadingAsk,
  //                        ctxRefreshBtn, translateInput, askQuestion }
  async function init(dom) {
    _el = dom;

    // Wire tab context manager. The `ready` callback fires AFTER storage is read
    // into the manager's map (before Promise resolves), so updatePageContext() can
    // safely use getCurrent() immediately after await.
    await window.tabContextManager.init(function onTcmReady() {
      // NOTE: do NOT call updatePageContext here — TCM's storage read fires synchronously
      // inside init(), and setting _pendingReadHandled here races with the sidepanel's
      // own storage read (below), causing the pending tab to be silently skipped.
      // The sidepanel handles pending tabs after its own storage read instead.
    });

    // Refresh button: re-extracts page content and updates ALL context box fields
    _el.ctxRefreshBtn?.addEventListener('click', async () => {
      // Add spinning class for animation
      _el.ctxRefreshBtn.classList.add('spinning');
      // Force reflow to ensure animation starts
      void _el.ctxRefreshBtn.offsetWidth;
      try {
        await updatePageContext(_el.translateInput);
      } finally {
        // Keep spinning for at least 500ms for visibility
        setTimeout(() => {
          _el.ctxRefreshBtn.classList.remove('spinning');
        }, 500);
      }
    });

    // React to async selection updates from content script (via storage bridge).
    // Only updates the translate input — context box itself always shows page content excerpt.
    window.addEventListener('tabctx-updated', function (e) {
      var ctx = e.detail && e.detail.ctx;
      if (!ctx) return;
      // Keep context UI synced, but don't let async empty payloads wipe existing content.
      applyContextToDOM(mergeCtxPreserveContent(ctx));
      if (ctx.selectedText && _el.translateInput && !_el.translateInput.value) {
        _el.translateInput.value = ctx.selectedText;
      }
    });
  }

  // ── Apply a TabContext to the context box DOM ─────────────────
  // Truncates title, URL, and content preview to 40 chars via window.truncate.
  // Preserves existing favicon/title/url when incoming ctx has empty values.
  function applyContextToDOM(ctx) {
    if (!ctx) return;
    console.log('[ClawSide applyContextToDOM] incoming ctx:', JSON.stringify({ favicon: ctx.favicon, title: ctx.title, url: ctx.url, selectedText: ctx.selectedText ? ctx.selectedText.substring(0, 20) + '...' : '' }));
    var truncate = window.truncate || function (s, max) {
      if (!s) return '';
      return s.length > max ? s.slice(0, max) + '\u2026' : s;
    };
    var favicon = ctx.favicon;
    var title = ctx.title;
    var url = ctx.url;
    // If incoming favicon is empty, try to preserve current DOM favicon (don't use fallback)
    if (!favicon && _el.ctxFavicon && _el.ctxFavicon.src) {
      // Check if current DOM has a real favicon (not the fallback)
      var currentDomSrc = _el.ctxFavicon.src;
      var fallbackFavicon = getFallbackFaviconUrl();
      if (currentDomSrc && currentDomSrc !== fallbackFavicon) {
        favicon = currentDomSrc;
        console.log('[ClawSide applyContextToDOM] preserving DOM favicon:', favicon);
      }
    }
    // Also try to preserve from TCM (but TCM might be stale)
    if (!favicon) {
      var currentCtx = window.tabContextManager.getCurrent();
      console.log('[ClawSide applyContextToDOM] currentCtx:', currentCtx ? JSON.stringify({ favicon: currentCtx.favicon, title: currentCtx.title, url: currentCtx.url }) : 'null');
      if (currentCtx && currentCtx.favicon) {
        favicon = currentCtx.favicon;
      }
    }
    console.log('[ClawSide applyContextToDOM] final favicon:', favicon);
    // Metadata
    if (_el.ctxFavicon) {
      const fallbackFavicon = getFallbackFaviconUrl();
      _el.ctxFavicon.onerror = function () {
        if (_el.ctxFavicon.src !== fallbackFavicon) {
          _el.ctxFavicon.src = fallbackFavicon;
        }
      };
      _el.ctxFavicon.src = favicon || fallbackFavicon;
    }
    if (_el.ctxTitle)   _el.ctxTitle.textContent = truncate(title, 40) || '—';
    if (_el.ctxUrl)     _el.ctxUrl.textContent = truncate(url, 40) || '—';
    // Selected text in context box
    if (_el.ctxSelectedText) {
      var contentSpan = _el.ctxSelectedText.querySelector('.page-selected-text-content');
      if (ctx.selectedText) {
        if (contentSpan) contentSpan.textContent = ctx.selectedText;
        _el.ctxSelectedText.classList.remove('hidden');
      } else {
        _el.ctxSelectedText.classList.add('hidden');
      }
    }
    // Preview: first 40 chars of page body content
    if (_el.ctxContentPreview) {
      _el.ctxContentPreview.textContent = truncate(ctx.content, 40);
    }
    // selectedText goes ONLY to translate input (NOT the context box)
    if (_el.translateInput && !_el.translateInput.value && ctx.selectedText) {
      _el.translateInput.value = ctx.selectedText;
    }
  }

  // ── State Accessors ─────────────────────────────────────────
  // Delegates to tabContextManager (single source of truth).
  function getCurrentUrl()        { var c = window.tabContextManager.getCurrent(); return c ? (c.url || '') : ''; }
  function getCurrentPageTitle()  { var c = window.tabContextManager.getCurrent(); return c ? (c.title || '') : ''; }
  function getCurrentPageContent(){ var c = window.tabContextManager.getCurrent(); return c ? (c.content || '') : ''; }
  function getSelectedText()      { var c = window.tabContextManager.getCurrent(); return c ? (c.selectedText || '') : ''; }

  function mergeCtxPreserveContent(incomingCtx) {
    var current = window.tabContextManager.getCurrent();
    var incomingContent = incomingCtx && incomingCtx.content ? incomingCtx.content : '';
    var currentContent = current && current.content ? current.content : '';
    if (incomingContent && incomingContent.trim().length >= MIN_CONTENT_LENGTH) {
      return incomingCtx;
    }
    return {
      url: incomingCtx.url || (current ? current.url : ''),
      title: incomingCtx.title || (current ? current.title : ''),
      favicon: incomingCtx.favicon || (current ? current.favicon : ''),
      content: currentContent,
      selectedText: incomingCtx.selectedText || (current ? current.selectedText : '')
    };
  }

  // Setters — used by sidepanel.js to inject context from floating-ball messages.
  // Updates the in-memory map (and persists in content script context via storage bridge).
  function setCurrentUrl(v)     {
    var ctx = window.tabContextManager.getCurrent();
    if (ctx) { ctx.url = v || ''; window.tabContextManager.set(window.tabContextManager.getActiveTabId(), ctx); }
  }
  function setCurrentPageTitle(v) {
    var ctx = window.tabContextManager.getCurrent();
    if (ctx) { ctx.title = v || ''; window.tabContextManager.set(window.tabContextManager.getActiveTabId(), ctx); }
  }
  function setCurrentPageContent(v) {
    var ctx = window.tabContextManager.getCurrent();
    if (ctx) { ctx.content = v || ''; window.tabContextManager.set(window.tabContextManager.getActiveTabId(), ctx); }
  }
  function setSelectedText(v)     { window.tabContextManager.setSelectedText(v); }

  // ── Inline page extractor (used via executeScript — self-contained, no closure) ─
  // This function is serialized by chrome.scripting.executeScript and runs in the
  // WEB PAGE context. It must be completely self-contained: all dependencies (e.g.
  // Readability) must be loaded dynamically. Checks window.Readability first (set
  // if content script ran and loaded the library into the page's isolated world —
  // content scripts' window is NOT shared with page scripts, so this often fails,
  // which is why we fall back to DOM-based extraction).
  //
  // Exposed as window.panelContext.extractPageContext so sidepanel.js can pass it
  // directly to executeScript's { func } parameter.
  var INLINE_EXTRACT_FN = function () {
    // Try Readability first (available if content script pre-loaded it)
    if (typeof window.Readability === 'function') {
      try {
        var clone = document.cloneNode(true);
        var parsed = new window.Readability(clone).parse();
        var text = (parsed ? parsed.textContent : '') || '';
        // JSON-LD
        var jsonLdText = '';
        try {
          var scripts = clone.querySelectorAll('script[type="application/ld+json"]');
          var parts = [];
          Array.prototype.slice.call(scripts).forEach(function(s){
            try {
              var d = JSON.parse(s.textContent);
              var items = Array.isArray(d) ? d : (d['@graph'] ? d['@graph'] : [d]);
              items.forEach(function(item){
                if (!item) return;
                var fields = ['headline','name','articleBody','text','contentText',
                  'description','summary','author','creator','publisher',
                  'datePublished','dateCreated','dateModified'];
                var ex = [];
                fields.forEach(function(f){
                  if(item[f]){var v=typeof item[f]==='object'?item[f].name||item[f]:item[f];ex.push(f+': '+v);}
                });
                if(ex.length>0) parts.push(ex.join(', '));
              });
            } catch(e2) {}
          });
          if(parts.length>0) jsonLdText = '\n[Structured Data]\n'+parts.join('\n');
        } catch(e1) {}
        return { content: text.trim().slice(0, 10000), jsonLd: jsonLdText };
      } catch(e) {}
    }
    // Fallback: basic text extraction (no Readability dependency)
    var c = document.cloneNode(true);
    var noise = ['script','style','noscript','iframe','svg','nav','footer','aside',
      '.ad','.ads','.advert','.sidebar','#sidebar','.social','.share',
      '.comment','#comments','.pagination','.skip-link','.sr-only',
      '[hidden]','a[href^="#"]'];
    noise.forEach(function(s){try{Array.prototype.slice.call(c.querySelectorAll(s)).forEach(function(el){el.remove();});}catch(ex){}});
    var raw = (c.innerText||'').trim();
    if(raw.length<200) raw=(c.textContent||'').trim();
    raw = raw.replace(/[\r\n]+/g,'\n').replace(/[ \t]+/g,' ').replace(/[\u200b-\u200f\u2028-\u202f]/g,'').trim();
    raw = raw.split('\n').filter(function(l){return l.trim().length>10;}).join('\n');
    raw = raw.replace(/^skip to[\s\S]*$/gim,'').replace(/^skip navigation[\s\S]*$/gim,'').trim();
    return {content: raw.slice(0,10000), jsonLd: ''};
  };

  // ── Visibility ───────────────────────────────────────────────
  function updateVisibility(activeTab) {
    if (!_el.panelContext) return;
    _el.panelContext.classList.toggle('hidden', !['translate', 'summarize', 'ask'].includes(activeTab));
    _el.ctxHeadingTranslate?.classList.toggle('hidden', activeTab !== 'translate');
    _el.ctxHeadingSummarize?.classList.toggle('hidden', activeTab !== 'summarize');
    _el.ctxHeadingAsk?.classList.toggle('hidden', activeTab !== 'ask');
  }

  // ── Main Refresh ─────────────────────────────────────────────
  // Orchestrates: (1) get active tab metadata, (2) extract page body content,
  // (3) build complete context, (4) update manager + apply to DOM.
  //
  // @param {HTMLTextAreaElement} translateInputEl  (optional) clear on URL change
  async function updatePageContext(translateInputEl) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      const prevUrl   = getCurrentUrl();
      const url       = tab.url       || '';
      const title     = tab.title     || '';
      const favicon   = tab.favIconUrl || '';

      // Preserve existing selectedText and favicon — don't lose them during refresh.
      // Use the ACTUAL active tab ID (from chrome.tabs.query), not TCM's stored activeTabId
      // (which might be a different tab if user switched tabs before opening panel).
      const activeTabId = tab.id;
      const existingCtx = window.tabContextManager.get(activeTabId);
      const selectedText = existingCtx ? existingCtx.selectedText : '';
      const existingFavicon = existingCtx ? existingCtx.favicon : '';

      // Extract page body content. Prefer TCM content (loaded from storage by content script)
      // over executeScript (requires host permissions — silently fails without them).
      let content = existingCtx && existingCtx.content ? existingCtx.content : '';
      const isExtensionPage = !tab.url
        || tab.url.startsWith('chrome://')
        || tab.url.startsWith('chrome-extension://');

      // Track whether we just extracted fresh content via executeScript.
      // IMPORTANT: executeScript is async — its .then() fires AFTER this block returns.
      // We use gotFreshContent so the guard below knows whether we should write TCM.
      let gotFreshContent = false;
      if (tab.id && !isExtensionPage && (!content || content.trim().length < MIN_CONTENT_LENGTH)) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: INLINE_EXTRACT_FN
          });
          const extracted = results?.[0]?.result || { content: '', jsonLd: '' };
          content = extracted.content + (extracted.jsonLd || '');
          gotFreshContent = content.length > 0;
        } catch (err) {
          // Silently ignore — host permission may not be granted for this host.
        }
      }

      // Build complete context
      const ctx = {
        url:          url,
        title:        title,
        favicon:      favicon || existingFavicon,
        content:      content,
        selectedText: selectedText,
      };

      // Keep side panel view aligned with the actual active browser tab.
      window.tabContextManager.setActiveTabId(activeTabId);

      // Always update TCM with refreshed content (even if existing content exists).
      // This ensures refresh button properly updates localStorage.
      if (tab.id && gotFreshContent) {
        window.tabContextManager.set(tab.id, ctx);
        window.tabContextManager.setActive(tab.id);
      }

      // Always update DOM
      applyContextToDOM(ctx);

      // Clear stale selection on URL change (navigation to a new page)
      if (prevUrl && prevUrl !== url) {
        setSelectedText('');
        if (translateInputEl) translateInputEl.value = '';
      }

      // Ask content script for current selection (async — tabctx-updated listener
      // will populate translate input if text is selected)
      if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'get_selection' }).catch(function () {});

    } catch (err) {
      console.warn('[ClawSide] updatePageContext error:', err.message || err);
    }
  }

  // ── Public API ────────────────────────────────────────────────
  window.panelContext = {
    init,
    updatePageContext,
    updateVisibility,
    getCurrentUrl,
    getCurrentPageTitle,
    getCurrentPageContent,
    getSelectedText,
    setCurrentUrl,
    setCurrentPageTitle,
    setCurrentPageContent,
    setSelectedText,
    extractPageContext: INLINE_EXTRACT_FN,
    _applyContext: applyContextToDOM, // used by sidepanel.js handlePendingTab
  };

})();
