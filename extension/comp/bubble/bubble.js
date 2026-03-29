// ClawSide - Floating Ball (Bubble + Popup + Dock + Radial Menu)
// All floating-UI logic for the content script.
// Shared modules loaded via manifest.json content_scripts array:
//   tools/icons.js   → SVG, svgIcon(), injectSprite()
//   tools/i18n.js   → loadI18n(), resolveLang(), getBrowserLang()
//   tools/styles.js  → THEMES, resolveAppearance(), injectTheme(), injectStyles(), CONTENT_STYLES
//   tools/browser.js → getBrowserLocale(), copyToClipboard()
// Dependencies are accessed via window.* globals (non-module scripts in content_scripts array).

(function () {
  'use strict';

  // === Shared state ===
  let lastSelectedText = '';
  let bubble = null;
  let popup = null;
  let hideTimer = null;
  let pendingRequests = new Map();
  let pendingTimeouts = new Map();
  let settings = { gatewayPort: '18789', authToken: '', language: 'auto', appearance: 'system' };
  let browserLang = 'en';

  // === Init ===
  async function init() {
    browserLang = window.getBrowserLang ? window.getBrowserLang() : 'en';

    const stored = await chrome.storage.local.get(['clawside_settings']);
    if (stored.clawside_settings) {
      settings = { ...settings, ...stored.clawside_settings };
    }

    const appearance = window.resolveAppearance ? window.resolveAppearance(settings.appearance) : 'dark';
    window.injectTheme((window.THEMES || {})[appearance] || (window.THEMES || {}).dark || {});
    window.injectStyles();
    await window.injectSprite(chrome.runtime.getURL('icons/icons.svg'));
    createDock();
    setupSelection();
    setupMessage();
    chrome.runtime.sendMessage({ type: 'content_ready', url: window.location.href, title: document.title }).catch(() => {});
  }

  // === Popup i18n helpers ===
  async function getPopupStrings(action) {
    const i18n = await window.loadI18n();
    const lang = settings.language === 'auto' ? browserLang
      : (settings.language === 'Chinese' ? 'zh' : settings.language === 'Japanese' ? 'ja' : 'en');
    const t = i18n[lang] || i18n.en || {};
    const loadingKey = { translate: 'translating', summarize: 'summarizing', ask: 'thinking' }[action] || 'loading';
    return {
      icon: window.svgIcon(action) || '',
      title: t[action] || action,
      loading: t[loadingKey] || 'Processing...'
    };
  }

  // === Bubble ===
  function createBubble() {
    if (bubble) bubble.remove();
    const el = document.createElement('div');
    el.className = 'cs-bubble';
    el.innerHTML = `
      <button class="cs-btn" id="cs-btn-translate" title="翻译">${window.svgIcon('translate') || ''}</button>
      <button class="cs-btn" id="cs-btn-summarize" title="总结">${window.svgIcon('summarize') || ''}</button>
      <button class="cs-btn" id="cs-btn-ask" title="提问">${window.svgIcon('ask') || ''}</button>
    `;
    document.body.appendChild(el);
    return el;
  }

  function positionBubble(el, rect) {
    const vw = window.innerWidth;
    const bw = 130;
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX + rect.width / 2 - bw / 2;
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

  // === Popup ===
  function createPopup() {
    if (popup) popup.remove();
    const el = document.createElement('div');
    el.className = 'cs-popup';
    el.innerHTML = `
      <div class="cs-popup-header">
        <span class="cs-popup-icon" id="cs-popup-icon"></span>
        <span class="cs-popup-title" id="cs-popup-title">Translation</span>
        <button class="cs-popup-close" id="cs-popup-close">✕</button>
      </div>
      <div class="cs-popup-body" id="cs-popup-body">
        <div class="cs-popup-loading">
          <div class="cs-spinner"></div>
          <span id="cs-popup-loading-text">Translating...</span>
        </div>
      </div>
      <div class="cs-popup-footer" id="cs-popup-footer" style="display:none">
        <span class="cs-popup-cite" id="cs-popup-cite"></span>
        <button class="cs-popup-copy" id="cs-popup-copy"></button>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function positionPopup(el, refRect) {
    const vw = window.innerWidth;
    const pw = 320;
    let top = refRect.bottom + window.scrollY + 8;
    if (refRect.bottom + 300 > window.innerHeight) {
      top = refRect.top + window.scrollY - 290 - 8;
    }
    let left = refRect.left + window.scrollX + refRect.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, vw - pw - 8));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
  }

  async function showPopup(action, _text, rect, onStreamChunk) {
    if (!popup) popup = createPopup();
    positionPopup(popup, rect || (bubble ? bubble.getBoundingClientRect() : null));

    const { icon, title, loading } = await getPopupStrings(action);
    popup.querySelector('.cs-popup-icon').innerHTML = icon;
    popup.querySelector('.cs-popup-title').textContent = title;
    popup.querySelector('#cs-popup-loading-text').textContent = loading;

    if (onStreamChunk) {
      popup.querySelector('.cs-popup-body').innerHTML = '<span id="cs-stream-text"></span><span class="cs-cursor">▋</span>';
      popup.querySelector('.cs-popup-body').style.whiteSpace = 'pre-wrap';
      popup.querySelector('.cs-popup-body').style.maxHeight = '220px';
      popup.querySelector('.cs-popup-body').style.overflowY = 'auto';
      startCursorBlink();
    }

    popup.querySelector('#cs-popup-footer').style.display = 'none';
    popup.style.display = 'flex';

    popup.querySelector('#cs-popup-close').onclick = hidePopup;
    popup.querySelector('#cs-popup-copy').onclick = () => {
      const body = popup.querySelector('#cs-popup-body').textContent;
      copyText(body, popup.querySelector('#cs-popup-copy'));
    };
  }

  let cursorInterval = null;
  function startCursorBlink() {
    stopCursorBlink();
    cursorInterval = setInterval(() => {
      const cursor = popup?.querySelector('.cs-cursor');
      if (cursor) cursor.style.opacity = cursor.style.opacity === '0' ? '1' : '0';
    }, 500);
  }
  function stopCursorBlink() {
    if (cursorInterval) { clearInterval(cursorInterval); cursorInterval = null; }
  }

  function appendStreamChunk(text) {
    const el = popup?.querySelector('#cs-stream-text');
    if (el) el.textContent += text;
    const body = popup?.querySelector('.cs-popup-body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  function finalizeStream(text, cite) {
    stopCursorBlink();
    const cursor = popup?.querySelector('.cs-cursor');
    if (cursor) cursor.remove();
    const body = popup?.querySelector('.cs-popup-body');
    if (body) {
      body.textContent = text;
      body.style.whiteSpace = 'pre-wrap';
    }
    const footer = popup?.querySelector('#cs-popup-footer');
    if (footer) {
      footer.style.display = 'flex';
      const citeEl = popup?.querySelector('#cs-popup-cite');
      if (cite && citeEl) {
        citeEl.textContent = cite;
        citeEl.style.display = '';
      } else if (citeEl) {
        citeEl.style.display = 'none';
      }
    }
  }

  function setPopupError(msg) {
    const body = popup?.querySelector('.cs-popup-body');
    const footer = popup?.querySelector('#cs-popup-footer');
    if (body) body.innerHTML = `<div class="cs-popup-error">${msg}</div>`;
    if (footer) footer.style.display = 'none';
  }

  function hidePopup() {
    if (popup) popup.style.display = 'none';
  }

  async function copyText(text, btn) {
    if (!window.copyToClipboard || !(await window.copyToClipboard(text))) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    btn.innerHTML = (window.svgIcon('check') || '') + ' Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = (window.svgIcon('copy') || '') + ' Copy';
      btn.classList.remove('copied');
    }, 1500);
  }

  // === API Call (streaming via background script) ===
  function apiCall(prompt, port, token) {
    return new Promise((resolve, reject) => {
      const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      let fullText = '';
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 90000);

      pendingRequests.set(requestId, {
        resolve,
        reject,
        fullText,
        onChunk: (chunk) => {
          fullText += chunk;
          pendingRequests.get(requestId).fullText = fullText;
        }
      });
      pendingTimeouts.set(requestId, timer);

      chrome.runtime.sendMessage({
        type: 'clawside-api',
        prompt,
        port: String(port || '18789'),
        token: String(token || '').trim(),
        requestId
      });
    });
  }

  async function doAction(action, text, url, title, question) {
    url = url || window.location.href;
    title = title || document.title;

    const stored = await chrome.storage.local.get(['clawside_settings']);
    const s = stored.clawside_settings || { gatewayPort: '18789', authToken: '' };
    const port = String(s.gatewayPort || '18789');
    const token = String(s.authToken || '').trim();

    let fullText = '';
    const onStreamChunk = (chunk) => {
      fullText += chunk;
      appendStreamChunk(chunk);
    };

    await showPopup(action, text, null, onStreamChunk);

    try {
      let cite = '';
      const targetLang = s.language && s.language !== 'auto'
        ? s.language
        : (window.getBrowserLocale ? window.getBrowserLocale() : 'English');
      if (action === 'translate') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        const prompt = `You are a professional translator. Translate the following text to ${targetLang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: ${text}`;
        await apiCall(prompt, port, token);
      } else if (action === 'summarize') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        const prompt = `You are a page summarizer. Summarize the following webpage content in 3-5 clear sentences in ${targetLang}. Focus on the main points and key information. Only output the summary, nothing else.\n\nPage URL: ${url}`;
        await apiCall(prompt, port, token);
      } else if (action === 'ask') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        const prompt = text
          ? `You are a helpful assistant. Answer in ${targetLang}. The user selected this text from a webpage:\n\n"${text}"\n\nPage: ${url}\n\nUser question: ${question || 'Please analyze and explain the selected text.'}`
          : `You are a helpful assistant. Answer in ${targetLang}. The user is viewing this page: ${url}\n\nUser question: ${question || 'Please summarize this page.'}`;
        await apiCall(prompt, port, token);
      }
      finalizeStream(fullText, cite);
    } catch (err) {
      setPopupError(err.message);
    }
  }

  // === Selection handling ===
  function handleSelection() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || '';
    if (!text || text === lastSelectedText) return;
    lastSelectedText = text;
    const range = sel?.getRangeAt(0);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    if (rect.width < 10) { hideBubble(); return; }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => showBubble(text, rect), 250);
  }

  function setupSelection() {
    document.addEventListener('mousedown', (e) => {
      if (popup && popup.contains(e.target)) return;
      if (bubble && bubble.contains(e.target)) return;
      hideBubble();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { hideBubble(); hidePopup(); }
    });
    document.addEventListener('mouseup', () => { setTimeout(handleSelection, 10); });
    document.addEventListener('selectionchange', () => { clearTimeout(hideTimer); hideTimer = setTimeout(handleSelection, 250); });

    // Bubble button handlers
    document.addEventListener('click', (e) => {
      if (!bubble || !bubble.contains(e.target)) return;
      e.stopPropagation();
      const btn = e.target.closest('.cs-btn');
      if (!btn) return;
      const id = btn.id;
      let action = null;
      if (id === 'cs-btn-translate') action = 'translate';
      else if (id === 'cs-btn-summarize') action = 'summarize';
      else if (id === 'cs-btn-ask') action = 'ask';
      if (!action) return;
      const text = lastSelectedText;
      if (!text) return;
      doAction(action, text, window.location.href, document.title, null);
      hideBubble();
    });
  }

  // === Message listener (handles streaming from background) ===
  function setupMessage() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'clawside-stream-chunk') {
        const req = pendingRequests.get(msg.requestId);
        if (req && typeof req.onChunk === 'function') {
          req.onChunk(msg.content);
        }
        return true;
      }
      if (msg.type === 'clawside-stream-done') {
        const req = pendingRequests.get(msg.requestId);
        if (req) {
          pendingRequests.delete(msg.requestId);
          clearTimeout(pendingTimeouts.get(msg.requestId));
          pendingTimeouts.delete(msg.requestId);
          if (req.resolve) req.resolve(req.fullText || '');
        }
        return true;
      }
      if (msg.type === 'clawside-stream-error') {
        const req = pendingRequests.get(msg.requestId);
        if (req) {
          pendingRequests.delete(msg.requestId);
          clearTimeout(pendingTimeouts.get(msg.requestId));
          pendingTimeouts.delete(msg.requestId);
          if (req.reject) req.reject(new Error(msg.error));
        }
        return true;
      }
      if (msg.type === 'get_selection') {
        const text = window.getSelection()?.toString().trim() || '';
        lastSelectedText = text;
        chrome.runtime.sendMessage({
          type: 'text_selected', text, url: window.location.href, title: document.title
        }).catch(() => {});
      }
      return true;
    });
  }

  // === Persistent Dock + Radial Menu ===
  let dock = null;
  let isSticking = false;
  let idleTimer = null;
  let isDragging = false;
  let menuOpen = false;
  let backdrop = null;
  let radialContainer = null;
  let startX, startY, startRight, startBottom;

  const TOOLS = [
    {
      id: 'translate',
      label: '翻译',
      color: '#58a6ff',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="3" y1="12" x2="21" y2="12"></line><ellipse cx="12" cy="12" rx="4" ry="9"></ellipse></svg>`,
    },
    {
      id: 'summarize',
      label: '总结',
      color: '#3fb950',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    },
    {
      id: 'ask',
      label: '提问',
      color: '#f0883e',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
    },
  ];

  // Radial menu layout
  const BUTTON_RADIUS = 16; // 32x32 px
  const EXPAND_RADIUS = 48; // distance from dock center to button center (px)
  const PER_ANGLE     = 45;  // degrees each button occupies (controls density)

  function calculatePetalPositions(radius, perAngle, count, startAngle = -90, clockwise = true) {
    const degToRad = (deg) => (deg * Math.PI) / 180;
    return Array.from({ length: count }, (_, i) => {
      const direction = clockwise ? -1 : 1;
      const totalDeg = startAngle + i * perAngle * direction;
      const rad = degToRad(totalDeg);
      return { x: radius * Math.sin(rad), y: radius * Math.cos(rad) };
    });
  }

  function getDockCenter() {
    const rect = dock.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function positionRadialMenu() {
    if (!dock) return;
    const c = getDockCenter();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const positions = calculatePetalPositions(EXPAND_RADIUS, PER_ANGLE, TOOLS.length);
    document.querySelectorAll('.cs-radial-btn').forEach((btn, i) => {
      if (i >= positions.length) return;
      const pos = positions[i];
      const left = Math.max(0, Math.min(vw - 32, c.x + pos.x - BUTTON_RADIUS));
      const top  = Math.max(0, Math.min(vh - 32, c.y + pos.y - BUTTON_RADIUS));
      btn.style.left = left + 'px';
      btn.style.top  = top  + 'px';
    });
  }

  function buildRadialMenu() {
    backdrop = document.createElement('div');
    backdrop.className = 'cs-radial-backdrop';
    document.body.appendChild(backdrop);

    radialContainer = document.createElement('div');

    let leaveTimer = null;
    dock.addEventListener('mouseleave', () => {
      if (!menuOpen) return;
      leaveTimer = setTimeout(() => {
        if (menuOpen) closeMenu(false);
        leaveTimer = null;
      }, 2000);
    });

    TOOLS.forEach((tool) => {
      const btn = document.createElement('button');
      btn.className = 'cs-radial-btn';
      btn.dataset.tool = tool.id;
      btn.style.cssText += `;background:${tool.color}1a;border-color:${tool.color}55;`;
      btn.innerHTML = `
        <span style="color:${tool.color}">${tool.icon}</span>
        <span class="cs-radial-label">${tool.label}</span>
      `;
      const c = getDockCenter();
      btn.style.left = (c.x - BUTTON_RADIUS) + 'px';
      btn.style.top  = (c.y - BUTTON_RADIUS) + 'px';

      btn.addEventListener('mouseenter', () => {
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu(false);
        openPanelWithTab(tool.id);
      });

      radialContainer.appendChild(btn);
      document.body.appendChild(btn);
    });
  }

  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;
    if (!radialContainer) buildRadialMenu();
    positionRadialMenu();
    backdrop.classList.add('visible');
    document.querySelectorAll('.cs-radial-btn').forEach((btn, i) => {
      setTimeout(() => btn.classList.add('expanded'), i * 60);
    });
    dock.classList.add('menu-open');
  }

  function closeMenu(animate = true) {
    if (!menuOpen) return;
    menuOpen = false;
    backdrop.classList.remove('visible');
    const btns = document.querySelectorAll('.cs-radial-btn');
    if (animate) {
      [...btns].reverse().forEach((btn, i) => {
        setTimeout(() => btn.classList.remove('expanded'), i * 30);
      });
    } else {
      btns.forEach(btn => btn.classList.remove('expanded'));
    }
    dock.classList.remove('menu-open');
  }

  function openPanelWithTab(tab) {
    chrome.runtime.sendMessage({
      type: 'panel-open-with-tab',
      tab,
      url: window.location.href,
      title: document.title,
      text: '',
    });
  }

  function stickDock() {
    if (!dock) return;
    dock.classList.add('sticking');
    dock.classList.remove('scrolling');
    isSticking = true;
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    isSticking = false;
    if (dock) dock.classList.add('scrolling');
    idleTimer = setTimeout(() => {
      if (dock) dock.classList.remove('scrolling');
      stickDock();
    }, 1000);
  }

  function createDock() {
    if (dock) return;
    dock = document.createElement('button');
    dock.className = 'cs-dock';
    dock.id = 'cs-dock';

    const icon = document.createElement('span');
    icon.className = 'cs-dock-icon';
    icon.textContent = '×';
    icon.style.fontSize = '16px';
    dock.appendChild(icon);

    dock.style.backgroundImage = "url('" + chrome.runtime.getURL('icons/icon32.png') + "')";

    let aboutToDrag = false;
    dock.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      aboutToDrag = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = dock.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      aboutToDrag = true;
      dock.classList.remove('sticking');
      isSticking = false;
      clearTimeout(idleTimer);
      dock.style.right = Math.max(0, startRight - dx) + 'px';
      dock.style.bottom = Math.max(0, startBottom - dy) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      aboutToDrag = false;
      resetIdleTimer();
    });

    dock.addEventListener('mouseenter', () => {
      if (aboutToDrag) return;
      openMenu();
    });

    dock.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuOpen) closeMenu(); else openMenu();
    });

    document.addEventListener('click', (e) => {
      if (!menuOpen) return;
      if (!dock.contains(e.target) && (!radialContainer || !radialContainer.contains(e.target))) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) closeMenu();
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'panel-state') {
        dock.classList.toggle('panel-open', msg.open);
      }
    });

    document.body.appendChild(dock);

    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      if (!isSticking) {
        resetIdleTimer();
      } else {
        dock.classList.remove('sticking');
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(stickDock, 1000);
      }
    }, { passive: true });

    idleTimer = setTimeout(stickDock, 1000);
  }

  // === Public API ===
  window.csBubble = { init };

})();
