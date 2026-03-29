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
  // All icons reference icons.svg sprite via <use>.
  // The SVG sprite is loaded into the page via background injection or
  // directly via chrome-extension:// URL from web_accessible_resources.

  const SVG = {
    translate: '<svg class="cs-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-translate"></use></svg>',
    summarize: '<svg class="cs-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-summarize"></use></svg>',
    ask: '<svg class="cs-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-ask"></use></svg>',
    copy: '<svg class="cs-icon" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-copy"></use></svg>',
    check: '<svg class="cs-icon" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-check"></use></svg>',
  };

  function svgIcon(name) {
    return SVG[name] || '';
  }

  /** Returns the SVG sprite URL for injection into the page. */
  function spriteUrl() {
    return chrome.runtime.getURL('icons.svg');
  }

  /** Injects the SVG sprite into the page DOM so <use href="#cs-icon-..."> resolves. */
  async function injectSprite() {
    if (document.getElementById('cs-sprite')) return;
    try {
      const res = await fetch(spriteUrl());
      const text = await res.text();
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:none';
      wrapper.innerHTML = text;
      document.body.appendChild(wrapper);
    } catch { /* sprite unavailable, icons fall back to empty string */ }
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
  chrome.storage.local.get(['clawside_settings']).then(async (result) => {
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
    await injectSprite();
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

      /* === Radial Menu === */
      .cs-radial-btn {
        position: fixed;
        width: 32px; height: 32px; border-radius: 50%;
        background: var(--cs-bg);
        border: 1px solid var(--cs-border);
        box-shadow: 0 2px 12px rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        pointer-events: all;
        opacity: 0;
        transform: scale(0);
        transition:
          opacity 200ms cubic-bezier(0.4, 0, 0.2, 1),
          transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
        overflow: visible;
        padding: 0;
        /* left/top set by JS — position fixed = viewport coords directly */
      }
      .cs-radial-btn.expanded {
        opacity: 1;
        transform: scale(1); /* explicit — overrides base scale(0) */
      }
      .cs-radial-btn.expanded:hover {
        background: var(--cs-btn-hover);
      }
      .cs-radial-btn.expanded:active {
        transform: scale(0.95);
      }
      .cs-radial-backdrop {
        position: fixed; inset: 0; z-index: 2147483644;
        pointer-events: none;
        opacity: 0;
        transition: opacity 200ms;
      }
      .cs-radial-backdrop.visible {
        opacity: 1;
      }
      .cs-radial-label {
        position: absolute; white-space: nowrap;
        font-size: 11px; font-family: system-ui, sans-serif;
        color: var(--cs-text);
        background: var(--cs-bg);
        border: 1px solid var(--cs-border);
        padding: 2px 7px; border-radius: 10px;
        pointer-events: none;
        opacity: 0;
        transform: scale(0.8);
        transition: opacity 150ms 80ms, transform 150ms 80ms;
        bottom: 50%;
        right: calc(100% + 6px);
      }
      .cs-radial-btn:hover .cs-radial-label {
        opacity: 1;
        transform: scale(1);
      }

      /* === Persistent Dock Ball === */
      .cs-dock {
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483646;
        width: 32px; height: 32px; border-radius: 50%;
        background-color: transparent;
        background-size: cover; background-position: center; background-repeat: no-repeat;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s, right 0.4s ease, bottom 0.4s ease, box-shadow 0.2s;
        user-select: none; border: none; overflow: visible; padding: 0;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      }
      .cs-dock:hover { transform: scale(1.12); }
      .cs-dock:active { transform: scale(0.95); }
      .cs-dock.menu-open { background-image: none; }
      .cs-dock.menu-open:hover { transform: scale(1.08) rotate(90deg); }
      .cs-dock.menu-open:active { transform: scale(0.95) rotate(90deg); }
      .cs-dock.sticking {
        right: 8px !important;
        transition: right 0.4s ease, bottom 0.4s ease, transform 0.2s, box-shadow 0.2s;
      }
      .cs-dock.scrolling { transition: none !important; }
      .cs-dock.panel-open {
        box-shadow: 0 0 20px rgba(102, 119, 255, 0.7);
      }
      /* Close overlay: hidden by default, shown when menu open */
      .cs-dock-icon {
        position: absolute; inset: 0;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none;
        background: rgba(0,0,0,0);
        color: #fff;
        transition: background 200ms, opacity 200ms;
        font-size: 16px; line-height: 1; font-weight: 400;
        opacity: 0;
      }
      .cs-dock.menu-open .cs-dock-icon {
        background: rgba(60,60,60,0.78);
        opacity: 1;
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
      icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="3" y1="12" x2="21" y2="12"></line><ellipse cx="12" cy="12" rx="4" ry="9"></ellipse></svg>`,
    },
    {
      id: 'summarize',
      label: '总结',
      color: '#3fb950',
      icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    },
    {
      id: 'ask',
      label: '提问',
      color: '#f0883e',
      icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
    },
  ];

  // Radial menu layout
  const BUTTON_RADIUS = 16; // 32x32 px
  const EXPAND_RADIUS = 48; // distance from dock center to button center (px)
  const PER_ANGLE     = 45;  // degrees each button occupies (controls density)

  /**
   * Calculate petal button positions.
   * @param {number} radius
   * @param {number} perAngle - degrees each button occupies
   * @param {number} count
   * @param {number} [startAngle=-90] - starting angle in degrees (-90 = 12 o'clock, 0 = 3 o'clock)
   * @param {boolean} [clockwise=true] - true = angles increase counter-clockwise on clock face (left/up)
   * @returns {Array<{x: number, y: number}>}
   */
  function calculatePetalPositions(radius, perAngle, count, startAngle = -90, clockwise = true) {
    const degToRad = (deg) => (deg * Math.PI) / 180;
    return Array.from({ length: count }, (_, i) => {
      const direction = clockwise ? -1 : 1;
      const totalDeg = startAngle + i * perAngle * direction;
      const rad = degToRad(totalDeg);
      // x positive = right, y positive = down (CSS viewport coords).
      // CSS angles: 0°=right, 90°=down, -90°=up, 180°/(-180°)=left.
      // clockwise=true → angles increase counter-clockwise on a clock face (left/up).
      // clockwise=false → angles increase clockwise on a clock face (right/down).
      return {
        x: radius * Math.sin(rad),
        y: radius * Math.cos(rad),
      };
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
      // Clamp so buttons stay within viewport
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
    // Buttons are appended to radialContainer but it's just a query handle.
    // radialContainer itself is NOT in the DOM (never appended).
    // Buttons use position:fixed so they are viewport-anchored regardless.

    let leaveTimer = null;
    dock.addEventListener('mouseleave', () => {
      if (!menuOpen) return;
      leaveTimer = setTimeout(() => {
        if (menuOpen) closeMenu();
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
      // Start collapsed at dock center
      const c = getDockCenter();
      btn.style.left = (c.x - BUTTON_RADIUS) + 'px';
      btn.style.top  = (c.y - BUTTON_RADIUS) + 'px';

      // Cancel close timer on button hover
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
    // Delegate to background script — chrome.sidePanel is not available in content scripts
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

    // × overlay (hidden when menu closed, shown when menu open)
    const icon = document.createElement('span');
    icon.className = 'cs-dock-icon';
    icon.textContent = '×';
    icon.style.fontSize = '16px';
    dock.appendChild(icon);

    // Set icon via JS — chrome.runtime.getURL() is the reliable path in content scripts
    dock.style.backgroundImage = "url('" + chrome.runtime.getURL('icons/icon32.png') + "')";

    // Drag
    let aboutToDrag = false; // true after mousemove threshold met, before mousedown sets isDragging
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
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // threshold for drag vs click
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

    // Dock hover: open menu (but not during a drag)
    dock.addEventListener('mouseenter', () => {
      if (aboutToDrag) return; // drag gesture in progress, don't open
      openMenu();
    });

    // Dock click: toggle menu (click when menu already open → close)
    dock.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuOpen) closeMenu(); else openMenu();
    });

    // Backdrop click: close menu
    document.addEventListener('click', (e) => {
      if (!menuOpen) return;
      if (!dock.contains(e.target) && (!radialContainer || !radialContainer.contains(e.target))) {
        closeMenu();
      }
    });

    // ESC: close menu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) closeMenu();
    });

    // Panel state
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

})();
