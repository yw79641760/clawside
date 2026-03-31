// ClawSide - Popup (Selection Bubble + Result Popup)
// Handles text selection UI (bubble near selection) and streaming result popup.
// Loaded after tab-context-manager.js in manifest content_scripts array.

(function () {
  'use strict';

  // === Local state ===
  var bubble = null;
  var popup = null;
  var hideTimer = null;
  var pendingRequests = {};
  var pendingTimeouts = {};

  // === Init ===
  async function init() {
    // Wire Chrome tab/navigation listeners and start tracking context.
    window.tabContextManager.init();

    var appearance = window.resolveAppearance
      ? window.resolveAppearance('system')
      : 'dark';
    window.injectTheme(window.THEMES[appearance] || window.THEMES.dark);
    window.injectStyles();
    window.injectSprite(chrome.runtime.getURL('assets/icons/icons.svg')).catch(function () {});
    setupSelection();
    setupStreamingListeners();
    chrome.runtime.sendMessage({
      type: 'content_ready',
      url: window.location.href,
      title: document.title
    }).catch(function () {});
  }

  // === Inline SVG icons for selection bubble buttons ===
  var BUBBLE_ICONS = {
    translate: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="3" y1="12" x2="21" y2="12"></line><ellipse cx="12" cy="12" rx="4" ry="9"></ellipse></svg>',
    summarize: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
    ask: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  };

  // === i18n helpers ===
  function getPopupStrings(action) {
    var msgKeyMap = { translate: 'tabTranslate', summarize: 'tabSummarize', ask: 'tabAsk' };
    var loadingKeyMap = { translate: 'translating', summarize: 'summarizing', ask: 'thinking' };
    var msgKey = msgKeyMap[action] || action;
    var loadingKey = loadingKeyMap[action] || 'loading';
    return {
      icon: BUBBLE_ICONS[action] || '',
      title: chrome.i18n.getMessage(msgKey) || msgKey,
      loading: chrome.i18n.getMessage(loadingKey) || loadingKey
    };
  }

  // === Selection Bubble ===
  function createBubble() {
    if (bubble) bubble.remove();
    var el = document.createElement('div');
    el.className = 'cs-bubble';
    var translateTooltip = chrome.i18n.getMessage('tabTranslate') || 'Translate';
    var summarizeTooltip = chrome.i18n.getMessage('tabSummarize') || 'Summarize';
    var askTooltip = chrome.i18n.getMessage('tabAsk') || 'Ask';
    el.innerHTML =
      '<button class="cs-btn" id="cs-btn-translate" title="' + translateTooltip + '">' + BUBBLE_ICONS.translate + '</button>' +
      '<button class="cs-btn" id="cs-btn-summarize" title="' + summarizeTooltip + '">' + BUBBLE_ICONS.summarize + '</button>' +
      '<button class="cs-btn" id="cs-btn-ask" title="' + askTooltip + '">' + BUBBLE_ICONS.ask + '</button>';
    document.body.appendChild(el);
    return el;
  }

  function positionBubble(el, rect) {
    var vw = window.innerWidth;
    var bw = 130;
    var top = rect.bottom + window.scrollY + 8;
    var left = rect.left + window.scrollX + rect.width / 2 - bw / 2;
    if (rect.bottom + 60 > window.innerHeight) {
      top = rect.top + window.scrollY - 46 - 8;
    }
    left = Math.max(8, Math.min(left, vw - bw - 8));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
  }

  function showBubble(text, rect) {
    if (!text || !rect) { hideBubble(); return; }
    if (!bubble) bubble = createBubble();
    positionBubble(bubble, rect);
    bubble.style.display = 'flex';
  }

  function hideBubble() {
    if (bubble) bubble.style.display = 'none';
    clearTimeout(hideTimer);
  }

  // === Result Popup ===
  function createPopup() {
    if (popup) popup.remove();
    var el = document.createElement('div');
    el.className = 'cs-popup';
    el.innerHTML =
      '<div class="cs-popup-header">' +
        '<span class="cs-popup-icon" id="cs-popup-icon"></span>' +
        '<span class="cs-popup-title" id="cs-popup-title">Translation</span>' +
        '<button class="cs-popup-close" id="cs-popup-close">&#10005;</button>' +
      '</div>' +
      '<div class="cs-popup-body" id="cs-popup-body">' +
        '<div class="cs-popup-loading">' +
          '<div class="cs-spinner"></div>' +
          '<span id="cs-popup-loading-text">Translating...</span>' +
        '</div>' +
      '</div>' +
      '<div class="cs-popup-footer" id="cs-popup-footer" style="display:none">' +
        '<span class="cs-popup-cite" id="cs-popup-cite"></span>' +
        '<button class="cs-popup-copy" id="cs-popup-copy"></button>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }

  function positionPopup(el, refRect) {
    var vw = window.innerWidth;
    var pw = 320;
    var top;
    if (refRect) {
      top = refRect.bottom + window.scrollY + 8;
      if (refRect.bottom + 300 > window.innerHeight) {
        top = refRect.top + window.scrollY - 290 - 8;
      }
      var left = refRect.left + window.scrollX + refRect.width / 2 - pw / 2;
      left = Math.max(8, Math.min(left, vw - pw - 8));
      el.style.top = top + 'px';
      el.style.left = left + 'px';
    } else {
      top = Math.max(8, window.innerHeight / 2 - 150);
      el.style.top = top + 'px';
      el.style.left = Math.max(8, vw / 2 - pw / 2) + 'px';
    }
  }

  async function showPopup(action, _text, rect, onStreamChunk) {
    if (!popup) popup = createPopup();
    var refRect = rect || (bubble ? bubble.getBoundingClientRect() : null);
    positionPopup(popup, refRect);

    var strings = getPopupStrings(action);
    popup.querySelector('.cs-popup-icon').innerHTML = strings.icon;
    popup.querySelector('.cs-popup-title').textContent = strings.title;
    popup.querySelector('#cs-popup-loading-text').textContent = strings.loading;

    if (onStreamChunk) {
      popup.querySelector('.cs-popup-body').innerHTML =
        '<span id="cs-stream-text"></span><span class="cs-cursor">&#x25BF;</span>';
      var bodyEl = popup.querySelector('.cs-popup-body');
      bodyEl.style.whiteSpace = 'pre-wrap';
      bodyEl.style.maxHeight = '220px';
      bodyEl.style.overflowY = 'auto';
      startCursorBlink();
    }

    popup.querySelector('#cs-popup-footer').style.display = 'none';
    popup.style.display = 'flex';

    popup.querySelector('#cs-popup-close').onclick = hidePopup;
    popup.querySelector('#cs-popup-copy').onclick = function () {
      var bodyText = popup.querySelector('#cs-popup-body').textContent;
      copyText(bodyText, popup.querySelector('#cs-popup-copy'));
    };
  }

  var cursorInterval = null;
  function startCursorBlink() {
    stopCursorBlink();
    cursorInterval = setInterval(function () {
      var cursor = popup && popup.querySelector('.cs-cursor');
      if (cursor) cursor.style.opacity = cursor.style.opacity === '0' ? '1' : '0';
    }, 500);
  }
  function stopCursorBlink() {
    if (cursorInterval) { clearInterval(cursorInterval); cursorInterval = null; }
  }

  function appendStreamChunk(text) {
    var el = popup && popup.querySelector('#cs-stream-text');
    if (el) el.textContent += text;
    var bodyEl = popup && popup.querySelector('.cs-popup-body');
    if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function finalizeStream(text, cite) {
    stopCursorBlink();
    var cursor = popup && popup.querySelector('.cs-cursor');
    if (cursor) cursor.remove();
    var bodyEl = popup && popup.querySelector('.cs-popup-body');
    if (bodyEl) {
      bodyEl.textContent = text;
      bodyEl.style.whiteSpace = 'pre-wrap';
    }
    var footer = popup && popup.querySelector('#cs-popup-footer');
    if (footer) {
      footer.style.display = 'flex';
      var citeEl = popup && popup.querySelector('#cs-popup-cite');
      if (cite && citeEl) {
        citeEl.textContent = cite;
        citeEl.style.display = '';
      } else if (citeEl) {
        citeEl.style.display = 'none';
      }
    }
  }

  function setPopupError(msg) {
    var bodyEl = popup && popup.querySelector('.cs-popup-body');
    var footer = popup && popup.querySelector('#cs-popup-footer');
    if (bodyEl) bodyEl.innerHTML = '<div class="cs-popup-error">' + msg + '</div>';
    if (footer) footer.style.display = 'none';
  }

  function hidePopup() {
    if (popup) popup.style.display = 'none';
  }

  async function copyText(text, btn) {
    if (window.copyToClipboard) {
      var ok = await window.copyToClipboard(text);
      if (ok) {
        btn.innerHTML = BUBBLE_ICONS.check + ' Copied';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.innerHTML = BUBBLE_ICONS.copy + ' Copy';
          btn.classList.remove('copied');
        }, 1500);
        return;
      }
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.innerHTML = BUBBLE_ICONS.check + ' Copied';
    btn.classList.add('copied');
    setTimeout(function () {
      btn.innerHTML = BUBBLE_ICONS.copy + ' Copy';
      btn.classList.remove('copied');
    }, 1500);
  }

  // === API Call (streaming via background script) ===
  function apiCall(prompt, port, token) {
    return new Promise(function (resolve, reject) {
      var requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      var fullText = '';
      var timer = setTimeout(function () {
        delete pendingRequests[requestId];
        reject(new Error('Request timeout'));
      }, 90000);

      pendingRequests[requestId] = {
        resolve: resolve,
        reject: reject,
        fullText: fullText,
        onChunk: function (chunk) {
          fullText += chunk;
          pendingRequests[requestId].fullText = fullText;
        }
      };
      pendingTimeouts[requestId] = timer;

      chrome.runtime.sendMessage({
        type: 'clawside-api',
        prompt: prompt,
        port: String(port || '18789'),
        token: String(token || '').trim(),
        requestId: requestId
      });
    });
  }

  async function doAction(action, text, url, title, question) {
    url = url || window.location.href;
    title = title || document.title;

    var stored = await chrome.storage.local.get(['clawside_settings']);
    var s = stored.clawside_settings || { gatewayPort: '18789', authToken: '' };
    var port = String(s.gatewayPort || '18789');
    var token = String(s.authToken || '').trim();

    var fullText = '';
    var onStreamChunk = function (chunk) {
      fullText += chunk;
      appendStreamChunk(chunk);
    };

    await showPopup(action, text, null, onStreamChunk);

    try {
      var cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
      var targetLang = (s.language && s.language !== 'auto')
        ? s.language
        : (window.getBrowserLocale ? window.getBrowserLocale() : 'English');

      var prompt;
      if (action === 'translate') {
        prompt = 'You are a professional translator. Translate the following text to ' + targetLang + '. Only output the translated text, nothing else. Be accurate and natural.\n\nText: ' + text;
        await apiCall(prompt, port, token);
      } else if (action === 'summarize') {
        prompt = 'You are a page summarizer. Summarize the following webpage content in 3-5 clear sentences in ' + targetLang + '. Focus on the main points and key information. Only output the summary, nothing else.\n\nPage URL: ' + url;
        await apiCall(prompt, port, token);
      } else if (action === 'ask') {
        if (text) {
          prompt = 'You are a helpful assistant. Answer in ' + targetLang + '. The user selected this text from a webpage:\n\n"' + text + '"\n\nPage: ' + url + '\n\nUser question: ' + (question || 'Please analyze and explain the selected text.');
        } else {
          prompt = 'You are a helpful assistant. Answer in ' + targetLang + '. The user is viewing this page: ' + url + '\n\nUser question: ' + (question || 'Please summarize this page.');
        }
        await apiCall(prompt, port, token);
      }
      finalizeStream(fullText, cite);
    } catch (err) {
      setPopupError(err.message);
    }
  }

  // === Selection handling ===
  function handleSelection() {
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (!text) return;

    // Sync selection to tabContextManager (tabId auto-detected from active tab)
    var ctx = window.tabContextManager.getCurrent();
    if (ctx && text === ctx.selectedText) return; // no change
    window.tabContextManager.setSelectedText(text);

    var range = sel && sel.getRangeAt(0);
    if (!range) return;
    var rect = range.getBoundingClientRect();
    if (rect.width < 10) { hideBubble(); return; }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { showBubble(text, rect); }, 250);
  }

  function setupSelection() {
    document.addEventListener('mousedown', function (e) {
      if (popup && popup.contains(e.target)) return;
      if (bubble && bubble.contains(e.target)) return;
      hideBubble();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hideBubble(); hidePopup(); }
    });
    document.addEventListener('mouseup', function () { setTimeout(handleSelection, 10); });
    document.addEventListener('selectionchange', function () {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(handleSelection, 250);
    });

    document.addEventListener('click', function (e) {
      if (!bubble || !bubble.contains(e.target)) return;
      e.stopPropagation();
      var btn = e.target.closest('.cs-btn');
      if (!btn) return;
      var id = btn.id;
      var action = null;
      if (id === 'cs-btn-translate') action = 'translate';
      else if (id === 'cs-btn-summarize') action = 'summarize';
      else if (id === 'cs-btn-ask') action = 'ask';
      if (!action) return;

      // Pull selected text from tabContextManager (shared across all tabs)
      var currentCtx = window.tabContextManager.getCurrent();
      var text = currentCtx ? currentCtx.selectedText : '';

      // Open side panel with the action tab, then auto-trigger if summarize
      chrome.storage.local.set({
        _pendingTab: currentCtx?.tabId || null,
        _pendingUrl: window.location.href,
        _pendingTitle: document.title,
        _pendingText: text,
        _pendingAction: action
      }).catch(function () {}); // Ignore errors (e.g., extension context invalidated)
      chrome.runtime.sendMessage({
        type: 'panel-open-with-tab',
        tab: currentCtx?.tabId || null,
        url: window.location.href,
        title: document.title,
        text: text,
        action: action
      }).catch(function () {});

      hideBubble();
    });
  }

  // === Streaming message listeners (tabContextManager handles tab/text sync) ===
  function setupStreamingListeners() {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg.type === 'clawside-stream-chunk') {
        var req = pendingRequests[msg.requestId];
        if (req && typeof req.onChunk === 'function') req.onChunk(msg.content);
        return true;
      }
      if (msg.type === 'clawside-stream-done') {
        var req2 = pendingRequests[msg.requestId];
        if (req2) {
          delete pendingRequests[msg.requestId];
          clearTimeout(pendingTimeouts[msg.requestId]);
          delete pendingTimeouts[msg.requestId];
          if (req2.resolve) req2.resolve(req2.fullText || '');
        }
        return true;
      }
      if (msg.type === 'clawside-stream-error') {
        var req3 = pendingRequests[msg.requestId];
        if (req3) {
          delete pendingRequests[msg.requestId];
          clearTimeout(pendingTimeouts[msg.requestId]);
          delete pendingTimeouts[msg.requestId];
          if (req3.reject) req3.reject(new Error(msg.error));
        }
        return true;
      }
      if (msg.type === 'panel-state') {
        hideBubble();
        hidePopup();
      }
      return true;
    });
  }

  // === Public API ===
  window.csPopup = { init: init };

})();
