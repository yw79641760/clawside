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
    try {
      // Get current tab and set active tab ID first - with timeout fallback
      var tabInfo = null;
      try {
        tabInfo = await new Promise(function(resolve, reject) {
          var timeout = setTimeout(function() { reject(new Error('timeout')); }, 2000);
          chrome.runtime.sendMessage({ type: 'get_current_tab' }, function(resp) {
            clearTimeout(timeout);
            resolve(resp);
          });
        });
      } catch(e) {}

      // Wire Chrome tab/navigation listeners and start tracking context.
      window.tabContextManager.init();

      // Set active tab after init so TCM knows which tab is active
      if (tabInfo && tabInfo.id) {
        // Use setActiveTabId to set directly without triggering content extraction
        if (window.tabContextManager.setActiveTabId) {
          window.tabContextManager.setActiveTabId(tabInfo.id);
        }
      }
    } catch(e) {}

    try {
      var appearance = window.resolveAppearance
        ? window.resolveAppearance('system')
        : 'dark';
      window.injectTheme(window.THEMES[appearance] || window.THEMES.dark);
      window.injectStyles();
    } catch(e) {}

    try {
      window.injectSprite(chrome.runtime.getURL('assets/icons/icons.svg')).catch(function () {});
    } catch(e) {}

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
    translate: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="3" y1="12" x2="21" y2="12"></line><ellipse cx="12" cy="12" rx="4" ry="9"></ellipse></svg>',
    summarize: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
    ask: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path></svg>',
    pinFilled: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path></svg>',
    edit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
    openExternal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>'
  };

  // === i18n helpers ===
  function getPopupStrings(action) {
    var msgKeyMap = { translate: 'tabTranslate', summarize: 'tabSummarize', ask: 'tabAsk' };
    var loadingKeyMap = { translate: 'translating', summarize: 'summarizing', ask: 'thinking' };
    var msgKey = msgKeyMap[action] || action;
    var loadingKey = loadingKeyMap[action] || 'loading';
    return {
      icon: window.svgIcon ? window.svgIcon(action) : (BUBBLE_ICONS[action] || ''),
      title: chrome.i18n.getMessage(msgKey) || msgKey,
      loading: chrome.i18n.getMessage(loadingKey) || loadingKey
    };
  }

  // === Prompt template substitution ===
  function applyPrompt(template, vars) {
    if (!template) return '';
    return template
      .replace(/\{text\}/g, vars.text || '')
      .replace(/\{lang\}/g, vars.lang || 'English')
      .replace(/\{title\}/g, vars.title || '')
      .replace(/\{url\}/g, vars.url || '')
      .replace(/\{content\}/g, vars.content || '')
      .replace(/\{question\}/g, vars.question || '')
      .replace(/\{selectedText\}/g, vars.selectedText || '');
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
    var bw = 92;
    var top = rect.bottom + 6;
    var left = rect.left + rect.width / 2 - bw / 2;
    if (rect.bottom + 36 > window.innerHeight) {
      top = rect.top - 28 - 6;
    }
    left = Math.max(8, Math.min(left, vw - bw - 8));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
  }

  function showBubble(text, rect) {
    if (!text || !rect) {
      if (bubble) bubble.style.display = 'none';
      return;
    }
    if (!bubble) {
      bubble = createBubble();
    }
    positionBubble(bubble, rect);
    bubble.style.display = 'flex';
  }

  function hideBubble() {
    if (bubble) bubble.style.display = 'none';
    clearTimeout(hideTimer);
  }

  // === Result Popup ===
  // Create translate/summarize popup (single result display)
  function createPopupBasic(action) {
    if (popup) popup.remove();
    var el = document.createElement('div');
    el.className = 'cs-popup';
    el.dataset.popupType = action; // 'translate' or 'summarize'
    el.innerHTML =
      '<div class="cs-popup-header">' +
        '<div class="cs-popup-drag-handle">' +
          '<svg width="16" height="6" viewBox="0 0 16 6" fill="none"><line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '</div>' +
        '<div class="cs-popup-header-main">' +
          '<span class="cs-popup-icon" id="cs-popup-icon"></span>' +
          '<span class="cs-popup-title" id="cs-popup-title">Translation</span>' +
          '<button class="cs-popup-pin" id="cs-popup-pin" title="Pin">' + BUBBLE_ICONS.pin + '</button>' +
          '<button class="cs-popup-close" id="cs-popup-close">&#10005;</button>' +
        '</div>' +
      '</div>' +
      '<div class="cs-popup-selected">' +
        '<span class="cs-popup-selected-text" id="cs-popup-selected-text"></span>' +
        '<button class="cs-popup-copy" id="cs-popup-copy">' + BUBBLE_ICONS.copy + '</button>' +
      '</div>' +
      '<div class="cs-popup-body" id="cs-popup-body">' +
        '<div class="cs-popup-loading">' +
          '<span id="cs-popup-loading-text"></span>' +
          '<div class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>' +
        '</div>' +
      '</div>' +
      '<div class="cs-popup-actions">' +
        '<button class="cs-popup-action-btn" id="cs-popup-copy-result" title="Copy">' + BUBBLE_ICONS.copy + '</button>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }

  // Create ask popup (chat interface)
  function createPopupAsk() {
    if (popup) popup.remove();
    var el = document.createElement('div');
    el.className = 'cs-popup cs-popup-ask';
    el.dataset.popupType = 'ask';
    el.innerHTML =
      '<div class="cs-popup-header">' +
        '<div class="cs-popup-drag-handle">' +
          '<svg width="16" height="6" viewBox="0 0 16 6" fill="none"><line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '</div>' +
        '<div class="cs-popup-header-main">' +
          '<span class="cs-popup-icon" id="cs-popup-icon">' + BUBBLE_ICONS.ask + '</span>' +
          '<span class="cs-popup-title" id="cs-popup-title">Ask</span>' +
          '<button class="cs-popup-open-external" id="cs-popup-open-external" title="Open in side panel">' + BUBBLE_ICONS.openExternal + '</button>' +
          '<button class="cs-popup-pin" id="cs-popup-pin" title="Pin">' + BUBBLE_ICONS.pin + '</button>' +
          '<button class="cs-popup-close" id="cs-popup-close">&#10005;</button>' +
        '</div>' +
      '</div>' +
      '<div class="cs-popup-selected">' +
        '<span class="cs-popup-selected-text" id="cs-popup-selected-text"></span>' +
        '<button class="cs-popup-copy" id="cs-popup-copy">' + BUBBLE_ICONS.copy + '</button>' +
      '</div>' +
      '<div class="cs-popup-chat-messages" id="cs-popup-chat-messages"></div>' +
      '<div class="cs-popup-chat-input-area">' +
        '<textarea class="cs-popup-chat-input" id="cs-popup-chat-input" placeholder="Ask a question..." rows="1"></textarea>' +
        '<button class="cs-popup-chat-send" id="cs-popup-chat-send">' + BUBBLE_ICONS.send + '</button>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }

  function createPopup(action) {
    if (action === 'ask') {
      return createPopupAsk();
    }
    return createPopupBasic(action);
  }

  function positionPopup(el, refRect) {
    el.style.position = 'fixed';
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var pw = 320;
    var top;
    if (refRect) {
      // getBoundingClientRect() returns coordinates relative to viewport (already considers scroll)
      // so we don't need to add scrollY
      top = refRect.bottom + 8;
      // If popup would go below viewport, show above the selection
      if (top + 280 > vh) {
        top = refRect.top - 280 - 8;
      }
      // Clamp to viewport bounds
      top = Math.max(8, Math.min(top, vh - 280 - 8));
      var left = refRect.left + refRect.width / 2 - pw / 2;
      left = Math.max(8, Math.min(left, vw - pw - 8));
      el.style.top = top + 'px';
      el.style.left = left + 'px';
    } else {
      top = Math.max(8, vh / 2 - 150);
      el.style.top = top + 'px';
      el.style.left = Math.max(8, vw / 2 - pw / 2) + 'px';
    }
  }

  async function showPopup(action, text, rect, onStreamChunk) {
    if (!popup || popup.dataset.popupType !== action) {
      popup = createPopup(action);
    }
    var refRect = rect || (bubble ? bubble.getBoundingClientRect() : null);
    positionPopup(popup, refRect);

    var isAskPopup = action === 'ask';
    var strings = getPopupStrings(action);

    // Set title and icon
    var titleEl = popup.querySelector('.cs-popup-title');
    if (titleEl) titleEl.textContent = strings.title;

    // For basic popup (translate/summarize)
    if (!isAskPopup) {
      // Set selected text
      var selectedEl = popup.querySelector('#cs-popup-selected-text');
      if (selectedEl) {
        var truncated = text ? (text.length > 30 ? text.substring(0, 30) + '...' : text) : '';
        selectedEl.textContent = truncated;
        selectedEl.dataset.fullText = text || '';
      }

      var iconEl = popup.querySelector('.cs-popup-icon');
      if (iconEl) iconEl.innerHTML = strings.icon;

      // Set loading text
      var loadingTextEl = popup.querySelector('#cs-popup-loading-text');
      if (loadingTextEl) {
        loadingTextEl.textContent = strings.loading;
      }

      if (onStreamChunk) {
        popup.querySelector('.cs-popup-body').innerHTML =
          '<div id="cs-stream-text" class="cs-popup-loading">' +
            '<span class="loading-text">' + strings.loading + '</span>' +
            '<div class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>' +
          '</div>';
        var bodyEl = popup.querySelector('.cs-popup-body');
        bodyEl.style.whiteSpace = 'pre-wrap';
        bodyEl.style.maxHeight = '220px';
        bodyEl.style.overflowY = 'auto';
        startCursorBlink();
      }
    } else {
      // Ask popup - setup chat UI
      var chatMessages = popup.querySelector('#cs-popup-chat-messages');
      if (chatMessages) {
        chatMessages.innerHTML = '';
        chatMessages.style.maxHeight = '150px';
        chatMessages.style.overflowY = 'auto';
        // Hide initially when empty, show when there's content
        chatMessages.style.display = 'none';
      }

      // Show selected text in ask popup (same as translate/summarize)
      var selectedEl = popup.querySelector('#cs-popup-selected-text');
      if (selectedEl) {
        var truncated = text ? (text.length > 30 ? text.substring(0, 30) + '...' : text) : '';
        selectedEl.textContent = truncated;
        selectedEl.dataset.fullText = text || '';
      }

      // Setup chat input send button
      var sendBtn = popup.querySelector('#cs-popup-chat-send');
      var chatInput = popup.querySelector('#cs-popup-chat-input');
      if (sendBtn && chatInput) {
        sendBtn.onclick = function() {
          var question = chatInput.value.trim();
          if (question) {
            handleAskSubmit(question);
          }
        };
        chatInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
          }
        });
      }
    }

    popup.style.display = 'flex';

    // Pin button toggle
    var pinBtn = popup.querySelector('#cs-popup-pin');
    var pinned = false;
    pinBtn.innerHTML = BUBBLE_ICONS.pin;
    pinBtn.onclick = function(e) {
      e.stopPropagation();
      pinned = !pinned;
      pinBtn.classList.toggle('pinned', pinned);
      pinBtn.innerHTML = pinned ? BUBBLE_ICONS.pinFilled : BUBBLE_ICONS.pin;
    };

    // Open in side panel button
    var openExternalBtn = popup.querySelector('#cs-popup-open-external');
    if (openExternalBtn) {
      openExternalBtn.onclick = function(e) {
        e.stopPropagation();
        var currentCtx = window.tabContextManager ? window.tabContextManager.getCurrent() : null;
        var text = currentCtx ? currentCtx.selectedText : '';
        // Determine action based on popup type
        var popupType = popup.dataset.popupType || 'translate';
        var action = (popupType === 'ask') ? 'ask' : 'translate';
        chrome.storage.local.set({
          _pendingTab: currentCtx?.tabId || null,
          _pendingUrl: window.location.href,
          _pendingTitle: document.title,
          _pendingText: text,
          _pendingAction: action
        }).catch(function () {});
        chrome.runtime.sendMessage({
          type: 'panel-open-with-tab',
          tab: currentCtx?.tabId || null,
          url: window.location.href,
          title: document.title,
          text: text,
          action: action
        }).catch(function () {});
        hidePopup();
      };
    }

    // Drag functionality
    var dragEl = popup.querySelector('.cs-popup-drag-handle');
    var isDragging = false;
    var dragOffsetX = 0;
    var dragOffsetY = 0;

    dragEl.addEventListener('mousedown', function(e) {
      isDragging = true;
      dragOffsetX = e.clientX - popup.offsetLeft;
      dragOffsetY = e.clientY - popup.offsetTop;
      dragEl.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      popup.style.left = (e.clientX - dragOffsetX) + 'px';
      popup.style.top = (e.clientY - dragOffsetY) + 'px';
    });

    document.addEventListener('mouseup', function() {
      if (isDragging) {
        isDragging = false;
        dragEl.style.cursor = 'grab';
      }
    });

    // Close button (works for all popup types)
    var closeBtn = popup.querySelector('#cs-popup-close');
    if (closeBtn) {
      closeBtn.onclick = hidePopup;
    }

    // For basic popup (translate/summarize) - setup action buttons
    if (!isAskPopup) {
      // Copy selected text button
      var copyBtn = popup.querySelector('#cs-popup-copy');
      if (copyBtn) {
        copyBtn.onclick = function () {
          var selectedEl = popup.querySelector('#cs-popup-selected-text');
          var selectedText = selectedEl.dataset.fullText || selectedEl.textContent;
          copyText(selectedText, copyBtn);
        };
      }

      // Copy result button
      var copyResultBtn = popup.querySelector('#cs-popup-copy-result');
      if (copyResultBtn) {
        copyResultBtn.onclick = function() {
          var bodyText = popup.querySelector('.cs-popup-body').textContent;
          copyText(bodyText, copyResultBtn);
        };
      }
    } else {
      // Ask popup - copy selected text button
      var askCopyBtn = popup.querySelector('#cs-popup-copy');
      if (askCopyBtn) {
        askCopyBtn.onclick = function() {
          var selectedEl = popup.querySelector('#cs-popup-selected-text');
          var selectedText = selectedEl.dataset.fullText || selectedEl.textContent;
          copyText(selectedText, askCopyBtn);
        };
      }
    }

    // Focus out: hide popup when clicking outside (unless pinned)
    var focusOutHandler = function(e) {
      if (pinned) return;
      if (popup && !popup.contains(e.target)) {
        hidePopup();
      }
    };
    setTimeout(function() {
      document.addEventListener('click', focusOutHandler);
    }, 100);
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
    if (el) {
      // Remove loading animation when first chunk arrives
      el.classList.remove('cs-popup-loading');
      var loadingText = el.querySelector('.loading-text');
      var loadingDots = el.querySelector('.loading-dots');
      if (loadingText) loadingText.remove();
      if (loadingDots) loadingDots.remove();
      el.textContent += text;
    }
    var bodyEl = popup && popup.querySelector('.cs-popup-body');
    if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function finalizeStream(text) {
    stopCursorBlink();
    var cursor = popup && popup.querySelector('.cs-cursor');
    if (cursor) cursor.remove();

    // For ask popup: add message to chat
    if (popup && popup.dataset.popupType === 'ask') {
      var chatMessages = popup && popup.querySelector('#cs-popup-chat-messages');
      if (chatMessages) {
        var msgEl = document.createElement('div');
        msgEl.className = 'cs-popup-chat-message assistant';
        // Parse markdown
        if (window.marked && typeof window.marked.parse === 'function') {
          msgEl.innerHTML = window.marked.parse(text);
        } else {
          msgEl.textContent = text;
        }
        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return;
    }

    // For basic popup (translate/summarize)
    var bodyEl = popup && popup.querySelector('.cs-popup-body');
    if (bodyEl) {
      // Parse markdown if marked is available
      if (window.marked && typeof window.marked.parse === 'function') {
        bodyEl.innerHTML = window.marked.parse(text);
      } else {
        bodyEl.textContent = text;
      }
      bodyEl.style.whiteSpace = 'pre-wrap';
    }
  }

  // Handle ask popup submit
  function handleAskSubmit(question) {
    var chatInput = popup && popup.querySelector('#cs-popup-chat-input');
    if (!chatInput) return;

    var chatMessages = popup && popup.querySelector('#cs-popup-chat-messages');
    if (!chatMessages) return;

    // Show chat messages container when there's content
    chatMessages.style.display = 'flex';

    // Add user message to chat
    var userMsg = document.createElement('div');
    userMsg.className = 'cs-popup-chat-message user';
    userMsg.innerHTML = '<div class="cs-popup-chat-message-content">' + question + '</div>' +
      '<div class="cs-popup-chat-message-actions">' +
        '<button class="cs-popup-chat-action-btn cs-popup-chat-edit" title="Edit">' + BUBBLE_ICONS.edit + '</button>' +
        '<button class="cs-popup-chat-action-btn cs-popup-chat-copy" title="Copy">' + BUBBLE_ICONS.copy + '</button>' +
      '</div>';
    chatMessages.appendChild(userMsg);

    // Wire up user message action buttons
    userMsg.querySelector('.cs-popup-chat-copy').onclick = function() {
      copyText(question, userMsg.querySelector('.cs-popup-chat-copy'));
    };
    userMsg.querySelector('.cs-popup-chat-edit').onclick = function() {
      chatInput.value = question;
      chatInput.focus();
    };
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Clear input
    chatInput.value = '';

    // Get selected text and page context
    var currentCtx = window.tabContextManager ? window.tabContextManager.getCurrent() : null;
    var selectedText = currentCtx ? currentCtx.selectedText : '';
    var pageUrl = currentCtx ? currentCtx.url : window.location.href;
    var pageTitle = currentCtx ? currentCtx.title : document.title;
    var pageContent = currentCtx ? (currentCtx.content || '').slice(0, 8000) : '';

    // Build prompt and call API
    chrome.storage.local.get(['clawside_settings']).then(function(stored) {
      var s = stored.clawside_settings || {};
      var browserLang = window.getBrowserLocale ? window.getBrowserLocale() : 'English';
      var replyLang = (s.language && s.language !== 'auto') ? s.language : browserLang;

      var templates = window.csSettings.getPromptTemplates(s, 'ask');
      var systemPrompt = templates ? templates.system : '';
      var prompt = templates ? window.csSettings.applyPrompt(templates.user, {
        selectedText: selectedText,
        question: question,
        lang: replyLang,
        title: pageTitle,
        url: pageUrl,
        content: pageContent
      }) : '';

      var port = String(s.gatewayPort || '18789');
      var token = String(s.authToken || '').trim();

      // Get loading text from i18n
      var loadingText = chrome.i18n.getMessage('thinking') || 'Thinking';

      // Create assistant message element for streaming with loading state
      var assistantMsg = document.createElement('div');
      assistantMsg.className = 'cs-popup-chat-message assistant cs-popup-loading';
      assistantMsg.innerHTML = '<span class="loading-text">' + loadingText + '</span>' +
        '<span class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>' +
        '<div class="cs-popup-chat-message-actions" style="display:none"><button class="cs-popup-chat-action-btn cs-popup-chat-copy" title="Copy">' + BUBBLE_ICONS.copy + '</button></div>';
      chatMessages.appendChild(assistantMsg);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Stream response
      var fullText = '';
      var onChunk = function(chunk) {
        fullText += chunk;
        // Remove loading state when first chunk arrives
        if (assistantMsg.classList.contains('cs-popup-loading')) {
          assistantMsg.classList.remove('cs-popup-loading');
          var loadingTextEl = assistantMsg.querySelector('.loading-text');
          var loadingDots = assistantMsg.querySelector('.loading-dots');
          if (loadingTextEl) loadingTextEl.remove();
          if (loadingDots) loadingDots.remove();
          // Show copy button after loading
          var actionsEl = assistantMsg.querySelector('.cs-popup-chat-message-actions');
          if (actionsEl) actionsEl.style.display = 'flex';
        }
        // Update content (keep actions)
        var actionsEl = assistantMsg.querySelector('.cs-popup-chat-message-actions');
        var contentHtml = window.marked && typeof window.marked.parse === 'function'
          ? window.marked.parse(fullText)
          : fullText;
        assistantMsg.innerHTML = contentHtml;
        if (actionsEl) {
          assistantMsg.appendChild(actionsEl);
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
      };

      // Use the existing apiCall function with streaming
      apiCall(prompt, port, token, systemPrompt, onChunk, 'ask').then(function() {
        // Done - streaming completed
        // Add copy button to finished response
        var actionsEl = assistantMsg.querySelector('.cs-popup-chat-message-actions');
        if (actionsEl) {
          actionsEl.style.display = 'flex';
          actionsEl.querySelector('.cs-popup-chat-copy').onclick = function() {
            copyText(fullText, actionsEl.querySelector('.cs-popup-chat-copy'));
          };
        }
      }).catch(function(err) {
        assistantMsg.classList.remove('cs-popup-loading');
        assistantMsg.innerHTML = '<div class="cs-popup-error">' + (err.message || 'Error') + '</div>';
      });
    });
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
        btn.innerHTML = BUBBLE_ICONS.check;
        btn.classList.add('copied');
        setTimeout(function () {
          btn.innerHTML = BUBBLE_ICONS.copy;
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
  function apiCall(prompt, port, token, systemPrompt, onChunk, toolName) {
    return new Promise(function (resolve, reject) {
      var requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      var fullText = '';
      var timer = setTimeout(function () {
        delete pendingRequests[requestId];
        reject(new Error('Request timeout'));
      }, 90000);

      // Get source tab ID for sending streaming responses back to this content script
      var sourceTabId = window.tabContextManager ? window.tabContextManager.getActiveTabId() : null;

      // Use provided onChunk callback or create default that updates fullText
      var chunkCallback = onChunk || systemPrompt || function (chunk) {
        fullText += chunk;
        pendingRequests[requestId].fullText = fullText;
      };

      pendingRequests[requestId] = {
        resolve: resolve,
        reject: reject,
        fullText: fullText,
        onChunk: chunkCallback
      };
      pendingTimeouts[requestId] = timer;

      chrome.runtime.sendMessage({
        type: 'clawside-api',
        prompt: prompt,
        systemPrompt: systemPrompt || '',
        port: String(port || '18789'),
        token: String(token || '').trim(),
        requestId: requestId,
        sourceTabId: sourceTabId,
        toolName: toolName || 'default'
      });
    });
  }

  // question parameter kept for future use (e.g., passing initial question from side panel)
  async function doAction(action, text, rect, question) {
    var url = window.location.href;
    var title = document.title;

    var stored = await chrome.storage.local.get(['clawside_settings']);
    var s = stored.clawside_settings || { gatewayPort: '18789', authToken: '', language: 'auto', translateLanguage: 'auto' };
    var port = String(s.gatewayPort || '18789');
    var token = String(s.authToken || '').trim();

    var fullText = '';
    var onStreamChunk = function (chunk) {
      fullText += chunk;
      appendStreamChunk(chunk);
    };

    await showPopup(action, text, rect, onStreamChunk);

    try {
      var browserLang = window.getBrowserLocale ? window.getBrowserLocale() : 'English';
      var replyLang = (s.language && s.language !== 'auto')
        ? s.language
        : browserLang;

      // translateLanguage: translation target, defaults to language setting
      var defaultLang = (s.language && s.language !== 'auto') ? s.language : browserLang;
      var translateLang = s.translateLanguage;
      var targetLang = (translateLang && translateLang !== 'auto')
        ? translateLang
        : defaultLang;

      // Get page context from tabContextManager
      var currentCtx = window.tabContextManager ? window.tabContextManager.getCurrent() : null;
      var pageUrl = currentCtx ? currentCtx.url : url;
      var pageTitle = currentCtx ? currentCtx.title : title;
      var pageContent = currentCtx ? (currentCtx.content || '').slice(0, 8000) : '';

      var prompt;
      var systemPrompt = '';
      if (action === 'translate') {
        // Use custom prompts from settings
        if (!window.csSettings) {
          console.error('[popup] window.csSettings not available');
          setPopupError('Settings not loaded');
          return;
        }
        var templates = window.csSettings.getPromptTemplates(s, 'translate');
        if (!templates) {
          console.error('[popup] translate templates not found');
          setPopupError('Translate template not found');
          return;
        }
        systemPrompt = applyPrompt(templates.system, { lang: targetLang });
        prompt = applyPrompt(templates.user, {
          text: text,
          lang: targetLang,
          title: pageTitle,
          url: pageUrl,
          content: pageContent
        });
        try {
          await apiCall(prompt, port, token, systemPrompt, onStreamChunk, 'translate');
        } catch (err) {
          console.error('[popup] apiCall error:', err);
          setPopupError(err.message);
        }
      } else if (action === 'summarize') {
        var templates = window.csSettings.getPromptTemplates(s, 'summarize');
        if (!templates) {
          console.error('[popup] summarize templates not found');
          setPopupError('Summarize template not found');
          return;
        }
        prompt = applyPrompt(templates.user, {
          text: text,
          lang: replyLang,
          title: pageTitle,
          url: pageUrl,
          content: pageContent
        });
        await apiCall(prompt, port, token, '', onStreamChunk, 'summarize');
      } else if (action === 'ask') {
        // Ask popup has its own handleAskSubmit to process chat messages
        // No need to call API here - handleAskSubmit will do it
        return;
      }
      // finalizeStream only for translate/summarize
      finalizeStream(fullText);
    } catch (err) {
      console.error('[popup] doAction error:', err);
      setPopupError(err.message);
    }
  }

  // === Selection handling ===
  function handleSelection() {
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (!text) {
      // Clear selectedText in tabContextManager so side panel can update
      try {
        window.tabContextManager.setSelectedText('');
      } catch (e) {}
      hideBubble();
      return;
    }

    // Try to sync selection to tabContextManager (ignore errors if context invalidated)
    try {
      var ctx = window.tabContextManager.getCurrent();
      if (ctx && text === ctx.selectedText) return; // no change
      window.tabContextManager.setSelectedText(text);
    } catch (e) {}

    var range = sel && sel.getRangeAt(0);
    if (!range) {
      hideBubble();
      return;
    }
    var rect = range.getBoundingClientRect();

    // Show bubble for any valid selection
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!text || !rect) {
        hideBubble();
        return;
      }
      if (!bubble) {
        bubble = createBubble();
      }
      positionBubble(bubble, rect);
      bubble.style.display = 'flex';
    }, 100);
  }

  function setupSelection() {
    // Hide bubble on mousedown (but not if clicking on bubble itself)
    document.addEventListener('mousedown', function (e) {
      if (popup && popup.contains(e.target)) return;
      if (bubble && bubble.contains(e.target)) return;
      hideBubble();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hideBubble(); hidePopup(); }
    });
    // Listen to both mouseup and selectionchange for better coverage
    document.addEventListener('mouseup', function () {
      setTimeout(handleSelection, 50);
    });
    document.addEventListener('selectionchange', function () {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(handleSelection, 100);
    });

    document.addEventListener('click', async function (e) {
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

      // For translate/summarize/ask: do it directly in popup
      if ((action === 'translate' || action === 'summarize' || action === 'ask') && text) {
        // Save bubble rect BEFORE hiding it (getBoundingClientRect returns zeros when display:none)
        var bubbleRect = bubble ? bubble.getBoundingClientRect() : null;
        hideBubble();
        await doAction(action, text, bubbleRect, null);
        return;
      }

      // Fallback: open side panel (should not reach here for current logic)
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
        if (req && typeof req.onChunk === 'function') {
          req.onChunk(msg.chunk);
        }
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
  window.csPopup = { init: init, doAction: doAction };

})();
