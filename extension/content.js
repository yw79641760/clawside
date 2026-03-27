// ClawSide - Content Script
// Floating bubble on selection + inline result popup

(function () {
  'use strict';

  // Skip if in extension URL
  if (window.location.protocol === 'chrome-extension:') return;

  let lastSelectedText = '';
  let bubble = null;
  let popup = null;
  let hideTimer = null;
  let pendingRequests = new Map();
  let pendingTimeouts = new Map();
  let settings = { gatewayPort: '18789', authToken: '', language: 'auto', appearance: 'system' };
  let csAppearance = 'dark';
  let browserLang = navigator.language?.startsWith('zh') ? 'zh' : navigator.language?.startsWith('ja') ? 'ja' : 'en';
  let popupI18N = null;

  // === SVG Icon Helper ===

  const SVG = {
    translate: '<svg class="cs-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="8" height="8" rx="1.5"></rect><circle cx="13" cy="6" r="1"></circle><path d="M4 18 L7.5 11 L11 18"></path><line x1="5" y1="16" x2="10" y2="16"></line><path d="M9.5 8 L9.5 5 Q11 3 12 4"></path><path d="M7.5 14 Q9 15.5 9.5 14"></path></svg>',
    summarize: '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
    ask: '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    copy: '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    check: '<svg class="cs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  };

  function svgIcon(name) {
    return SVG[name] || '';
  }

  async function loadPopupI18n() {
    if (popupI18N) return popupI18N;
    try {
      const res = await fetch(chrome.runtime.getURL('i18n.json'));
      popupI18N = await res.json();
    } catch {
      popupI18N = { en: {}, zh: {}, ja: {} };
    }
    return popupI18N;
  }

  function resolvePopupLang(lang) {
    if (lang === 'auto') return browserLang;
    return lang === 'Chinese' ? 'zh' : lang === 'Japanese' ? 'ja' : 'en';
  }

  async function getPopupStrings(action) {
    const i18n = await loadPopupI18n();
    const lang = resolvePopupLang(settings.language);
    const t = i18n[lang] || i18n.en || {};
    const loadingKey = { translate: 'translating', summarize: 'summarizing', ask: 'thinking' }[action] || 'loading';
    return {
      svgIcon: svgIcon(action),
      title: t[action] || action,
      loading: t[loadingKey] || 'Processing...'
    };
  }

  // Load settings from storage
  chrome.storage.local.get(['clawside_settings']).then((result) => {
    if (result.clawside_settings) {
      settings = { ...settings, ...result.clawside_settings };
    }
    // Resolve appearance
    const a = settings.appearance || 'system';
    if (a === 'system') {
      csAppearance = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
      csAppearance = a;
    }
    injectTheme(csAppearance);
    injectStyles();
    createDock();
    chrome.runtime.sendMessage({ type: 'content_ready', url: window.location.href, title: document.title }).catch(() => {});
  });

  // === Theme injection ===
  function injectTheme(appearance) {
    const isDark = appearance === 'dark';
    const vars = isDark ? {
      '--cs-bg': '#161b22',
      '--cs-border': '#30363d',
      '--cs-text': '#e6edf3',
      '--cs-muted': '#8b949e',
      '--cs-primary': '#58a6ff',
      '--cs-success': '#3fb950',
      '--cs-error': '#f85149',
      '--cs-btn-hover': '#262c34',
      '--cs-btn-active': '#32393f',
      '--cs-header-bg': 'rgba(255,255,255,0.02)',
      '--cs-scrollbar': '#30363d',
    } : {
      '--cs-bg': '#ffffff',
      '--cs-border': '#d0d7de',
      '--cs-text': '#1f2328',
      '--cs-muted': '#656d76',
      '--cs-primary': '#0969da',
      '--cs-success': '#1a7f37',
      '--cs-error': '#cf222e',
      '--cs-btn-hover': '#eaeef2',
      '--cs-btn-active': '#d0d7de',
      '--cs-header-bg': 'rgba(0,0,0,0.02)',
      '--cs-scrollbar': '#d0d7de',
    };
    const s = document.createElement('style');
    s.id = 'cs-theme';
    let css = ':root {';
    for (const [k, v] of Object.entries(vars)) css += k + ':' + v + ';';
    css += '}';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // === Styles ===
  function injectStyles() {
    if (document.getElementById('clawside-styles')) return;
    const s = document.createElement('style');
    s.id = 'clawside-styles';
    s.textContent = `
      .cs-bubble {
        position: fixed; z-index: 2147483647;
        display: flex; gap: 4px;
        background: var(--cs-bg); border: 1px solid var(--cs-border);
        border-radius: 8px; padding: 5px 7px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.45);
        font-family: system-ui, -apple-system, sans-serif;
        animation: cs-bubble-in 150ms ease-out;
        color: var(--cs-text);
      }
      @keyframes cs-bubble-in {
        from { opacity: 0; transform: translateY(5px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .cs-btn {
        width: 34px; height: 34px; border: none; background: transparent;
        border-radius: 6px; cursor: pointer; font-size: 17px;
        display: flex; align-items: center; justify-content: center;
        transition: background 100ms ease, transform 80ms ease;
        padding: 0;
      }
      .cs-btn:hover { background: var(--cs-btn-hover); }
      .cs-btn:active { background: var(--cs-btn-active); transform: scale(0.92); }

      .cs-popup {
        position: fixed; z-index: 2147483647;
        width: 320px; max-height: 280px;
        background: var(--cs-bg); border: 1px solid var(--cs-border);
        border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: system-ui, -apple-system, sans-serif;
        display: flex; flex-direction: column;
        overflow: hidden;
        animation: cs-popup-in 180ms ease-out;
        color: var(--cs-text);
      }
      @keyframes cs-popup-in {
        from { opacity: 0; transform: scale(0.9) translateY(-6px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      .cs-popup-header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px; border-bottom: 1px solid var(--cs-border);
        background: var(--cs-header-bg);
      }
      .cs-popup-icon { font-size: 14px; }
      .cs-popup-title { flex: 1; font-size: 13px; font-weight: 600; color: var(--cs-text); }
      .cs-popup-close {
        width: 26px; height: 26px; border: none; background: transparent;
        border-radius: 4px; cursor: pointer; font-size: 14px;
        color: var(--cs-muted); display: flex; align-items: center; justify-content: center;
        transition: background 100ms;
      }
      .cs-popup-close:hover { background: var(--cs-btn-hover); color: var(--cs-text); }
      .cs-popup-body {
        flex: 1; padding: 12px; overflow-y: auto;
        font-size: 13px; line-height: 1.6; color: var(--cs-text);
        word-break: break-word;
      }
      .cs-popup-body::-webkit-scrollbar { width: 5px; }
      .cs-popup-body::-webkit-scrollbar-thumb { background: var(--cs-scrollbar); border-radius: 3px; }
      .cs-popup-footer {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px; border-top: 1px solid var(--cs-border);
      }
      .cs-popup-cite {
        flex: 1; font-size: 11px; color: var(--cs-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .cs-popup-copy {
        padding: 4px 10px; border: 1px solid var(--cs-border); background: transparent;
        border-radius: 5px; cursor: pointer; font-size: 12px; color: var(--cs-muted);
        transition: all 100ms;
      }
      .cs-popup-copy:hover { border-color: var(--cs-primary); color: var(--cs-primary); }
      .cs-popup-copy.copied { border-color: var(--cs-success); color: var(--cs-success); }

      .cs-popup-loading {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 10px; padding: 28px 16px; color: var(--cs-muted);
        font-size: 13px;
      }
      .cs-spinner {
        width: 22px; height: 22px; border: 2px solid var(--cs-border);
        border-top-color: var(--cs-primary); border-radius: 50%;
        animation: cs-spin 600ms linear infinite;
      }
      @keyframes cs-spin { to { transform: rotate(360deg); } }

      .cs-popup-error {
        padding: 12px; color: var(--cs-error); font-size: 13px;
      }

      /* === Persistent Dock Ball === */
      .cs-dock {
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483646;
        width: 32px; height: 32px; border-radius: 50%;
        background: transparent;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s, right 0.4s ease, bottom 0.4s ease;
        user-select: none; border: none; overflow: visible; padding: 0;
        box-shadow: 0 0 16px rgba(102, 126, 234, 0.5);
      }
      .cs-dock:hover {
        transform: scale(1.12);
      }
      .cs-dock:active {
        transform: scale(0.95);
      }
      .cs-dock.sticking {
        right: 8px !important;
        transition: right 0.4s ease, bottom 0.4s ease, transform 0.2s;
      }
      .cs-dock.scrolling {
        transition: none !important;
      }
      .cs-dock.panel-open {
        background: rgba(102, 126, 234, 0.15);
        box-shadow: 0 0 20px rgba(102, 126, 234, 0.7);
      }
      .cs-dock-tooltip {
        position: absolute; right: 38px; bottom: 50%;
        transform: translateY(50%);
        background: var(--cs-bg); border: 1px solid var(--cs-border);
        color: var(--cs-text); font-size: 12px; white-space: nowrap;
        padding: 5px 10px; border-radius: 8px;
        pointer-events: none; opacity: 0; transition: opacity 0.15s;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .cs-dock:hover .cs-dock-tooltip { opacity: 1; }
      .cs-dock-img {
        width: 32px; height: 32px;
        pointer-events: none; border-radius: 50%;
      }

      .cs-icon {
        width: 16px; height: 16px; flex-shrink: 0;
      }
      .cs-icon-sm {
        width: 14px; height: 14px; flex-shrink: 0;
      }
    `;
    document.head.appendChild(s);
  }

  // === Bubble ===
  function createBubble() {
    if (bubble) bubble.remove();
    const el = document.createElement('div');
    el.className = 'cs-bubble';
    el.innerHTML = `
      <button class="cs-btn" id="cs-btn-translate" title="翻译">${svgIcon('translate')}</button>
      <button class="cs-btn" id="cs-btn-summarize" title="总结">${svgIcon('summarize')}</button>
      <button class="cs-btn" id="cs-btn-ask" title="提问">${svgIcon('ask')}</button>
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
    positionPopup(popup, rect || bubble.getBoundingClientRect());

    const { svgIcon: icon, title, loading } = await getPopupStrings(action);
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
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    btn.innerHTML = svgIcon('check');
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = svgIcon('copy');
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
      if (action === 'translate') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        const targetLang = s.language && s.language !== 'auto'
          ? s.language
          : (navigator.language?.startsWith('zh') ? 'Chinese'
             : navigator.language?.startsWith('ja') ? 'Japanese'
             : 'English');
        const prompt = `You are a professional translator. Translate the following text to ${targetLang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: ${text}`;
        await apiCall(prompt, port, token);

      } else if (action === 'summarize') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        const lang = s.language && s.language !== 'auto'
          ? s.language
          : (navigator.language?.startsWith('zh') ? 'Chinese'
             : navigator.language?.startsWith('ja') ? 'Japanese'
             : 'English');
        const prompt = `You are a page summarizer. Summarize the following webpage content in 3-5 clear sentences in ${lang}. Focus on the main points and key information. Only output the summary, nothing else.\n\nPage URL: ${url}`;
        await apiCall(prompt, port, token);

      } else if (action === 'ask') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        const lang = s.language && s.language !== 'auto'
          ? s.language
          : (navigator.language?.startsWith('zh') ? 'Chinese'
             : navigator.language?.startsWith('ja') ? 'Japanese'
             : 'English');
        const prompt = text
          ? `You are a helpful assistant. Answer in ${lang}. The user selected this text from a webpage:\n\n"${text}"\n\nPage: ${url}\n\nUser question: ${question || 'Please analyze and explain the selected text.'}`
          : `You are a helpful assistant. Answer in ${lang}. The user is viewing this page: ${url}\n\nUser question: ${question || 'Please summarize this page.'}`;
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

  // === Bubble button handlers ===
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

  // === Message listener (handles streaming from background) ===
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

  // === Persistent Dock Ball ===
  let dock = null;
  let isSticking = false;
  let idleTimer = null;

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
    dock.title = 'ClawSide';

    // Icon image: <img> inside the button — reliable, no CSS layering issues
    const img = document.createElement('img');
    img.className = 'cs-dock-img';
    img.src = chrome.runtime.getURL('icons/icon32.png');
    img.alt = 'ClawSide';
    dock.appendChild(img);

    // Tooltip
    const tooltip = document.createElement('span');
    tooltip.className = 'cs-dock-tooltip';
    tooltip.textContent = 'ClawSide';
    dock.appendChild(tooltip);

    // Drag to reposition
    let isDragging = false, startX, startY, startRight, startBottom;
    dock.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
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
      const newRight = Math.max(0, startRight - dx);
      const newBottom = Math.max(0, startBottom - dy);
      dock.style.right = newRight + 'px';
      dock.style.bottom = newBottom + 'px';
      dock.classList.remove('sticking');
      isSticking = false;
      clearTimeout(idleTimer);
    });
    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      resetIdleTimer();
    });

    // Click to toggle side panel (must be synchronous to satisfy Chrome's user gesture requirement)
    let panelOpen = false;

    dock.addEventListener('click', (e) => {
      if (isDragging) return;
      e.stopPropagation();

      if (panelOpen) {
        // Close panel
        chrome.sidePanel.close().then(() => {
          panelOpen = false;
          dock.classList.remove('panel-open');
        }).catch(() => {});
      } else {
        // Open panel
        chrome.sidePanel.open().then(() => {
          panelOpen = true;
          dock.classList.add('panel-open');
        }).catch((err) => {
          console.error('[ClawSide] sidePanel.open error:', err);
        });
      }
    });

    // Sync state when panel is closed by user (ESC, X, click outside)
    if (chrome.sidePanel.onClosed) {
      chrome.sidePanel.onClosed.addListener(() => {
        panelOpen = false;
        dock.classList.remove('panel-open');
      });
    }

    // Sync state when panel is opened (e.g. via action icon)
    if (chrome.sidePanel.onOpened) {
      chrome.sidePanel.onOpened.addListener(() => {
        panelOpen = true;
        dock.classList.add('panel-open');
      });
    }

    document.body.appendChild(dock);

    // Scroll detection
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

})();
