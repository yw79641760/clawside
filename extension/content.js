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
  let currentAction = null;
  let pendingRequests = new Map();
  let pendingTimeouts = new Map();
  let settings = { gatewayPort: '18789', authToken: '', language: 'auto', appearance: 'system' };
  let csAppearance = 'dark';

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
      '--cs-dock-grad': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      '--cs-dock-shadow': 'rgba(102,126,234,0.45)',
      '--cs-dock-hover-shadow': 'rgba(102,126,234,0.6)',
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
      '--cs-dock-grad': 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
      '--cs-dock-shadow': 'rgba(142,197,252,0.45)',
      '--cs-dock-hover-shadow': 'rgba(142,197,252,0.7)',
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
        width: 30px; height: 30px; border-radius: 50%;
        background-image: var(--cs-dock-grad);
        box-shadow: 0 4px 20px var(--cs-dock-shadow);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 16px; transition: transform 0.2s, box-shadow 0.2s, right 0.4s ease, bottom 0.4s ease;
        user-select: none; border: none;
      }
      .cs-dock:hover {
        transform: scale(1.12);
        box-shadow: 0 6px 28px var(--cs-dock-hover-shadow);
      }
      .cs-dock:active {
        transform: scale(0.95);
      }
      .cs-dock.sticking {
        right: 8px !important;
        transition: right 0.4s ease, bottom 0.4s ease, transform 0.2s, box-shadow 0.2s;
      }
      .cs-dock.scrolling {
        transition: none !important;
      }
      .cs-dock-tooltip {
        position: absolute; right: 38px; bottom: 2px;
        background: var(--cs-bg); border: 1px solid var(--cs-border);
        color: var(--cs-text); font-size: 12px; white-space: nowrap;
        padding: 5px 10px; border-radius: 8px;
        pointer-events: none; opacity: 0; transition: opacity 0.15s;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .cs-dock:hover .cs-dock-tooltip { opacity: 1; }
    `;
    document.head.appendChild(s);
  }

  // === Bubble ===
  function createBubble() {
    if (bubble) bubble.remove();
    const el = document.createElement('div');
    el.className = 'cs-bubble';
    el.innerHTML = `
      <button class="cs-btn" id="cs-btn-translate" title="翻译">🌐</button>
      <button class="cs-btn" id="cs-btn-summarize" title="总结">📄</button>
      <button class="cs-btn" id="cs-btn-ask" title="提问">💬</button>
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
        <span class="cs-popup-icon" id="cs-popup-icon">🌐</span>
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
        <button class="cs-popup-copy" id="cs-popup-copy">📋 Copy</button>
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

  function showPopup(action, text, rect, onStreamChunk) {
    currentAction = action;
    if (!popup) popup = createPopup();
    positionPopup(popup, rect || bubble.getBoundingClientRect());

    const icons = { translate: '🌐', summarize: '📄', ask: '💬' };
    const titles = { translate: 'Translation', summarize: 'Summary', ask: 'Answer' };
    const loadingTexts = { translate: 'Translating...', summarize: 'Summarizing...', ask: 'Thinking...' };

    popup.querySelector('.cs-popup-icon').textContent = icons[action] || '🌐';
    popup.querySelector('.cs-popup-title').textContent = titles[action] || action;
    popup.querySelector('#cs-popup-loading-text').textContent = loadingTexts[action] || 'Processing...';

    if (onStreamChunk) {
      // Streaming mode: show streaming text area
      popup.querySelector('.cs-popup-body').innerHTML = '<span id="cs-stream-text"></span><span class="cs-cursor">▋</span>';
      popup.querySelector('.cs-popup-body').style.cssText = 'white-space:pre-wrap;max-height:220px;overflow-y:auto;';
      startCursorBlink();
    } else {
      // Loading mode
      popup.querySelector('.cs-popup-body').innerHTML = `
        <div class="cs-popup-loading">
          <div class="cs-spinner"></div>
          <span>${loadingTexts[action]}</span>
        </div>`;
    }

    popup.querySelector('#cs-popup-footer').style.display = 'none';
    popup.style.display = 'flex';

    popup.querySelector('#cs-popup-close').onclick = hidePopup;
    popup.querySelector('#cs-popup-copy').onclick = () => {
      const body = popup.querySelector('#cs-popup-body').textContent;
      copyText(body, popup.querySelector('#cs-popup-copy'));
    };

    return onStreamChunk; // return so doAction can wire up streaming
  }

  function setPopupStreaming() {
    // Switch popup body from loading spinner to streaming text
    const body = popup.querySelector('.cs-popup-body');
    body.innerHTML = '<span id="cs-stream-text"></span><span class="cs-cursor">▋</span>';
    body.style.whiteSpace = 'pre-wrap';
    startCursorBlink();
  }

  function appendStreamChunk(text) {
    const el = popup.querySelector('#cs-stream-text');
    const cursor = popup.querySelector('.cs-cursor');
    if (el) el.textContent += text;
    // Auto-scroll
    popup.querySelector('.cs-popup-body').scrollTop = popup.querySelector('.cs-popup-body').scrollHeight;
  }

  function finalizeStream(text, cite) {
    stopCursorBlink();
    const cursor = popup.querySelector('.cs-cursor');
    if (cursor) cursor.remove();
    const body = popup.querySelector('.cs-popup-body');
    body.textContent = text;
    body.style.whiteSpace = 'pre-wrap';
    const footer = popup.querySelector('#cs-popup-footer');
    footer.style.display = 'flex';
    if (cite) {
      popup.querySelector('#cs-popup-cite').textContent = cite;
      popup.querySelector('#cs-popup-cite').style.display = '';
    } else {
      popup.querySelector('#cs-popup-cite').style.display = 'none';
    }
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

  function setPopupResult(text, cite) {
    const body = popup.querySelector('#cs-popup-body');
    body.textContent = text;
    const footer = popup.querySelector('#cs-popup-footer');
    footer.style.display = 'flex';
    if (cite) {
      popup.querySelector('#cs-popup-cite').textContent = cite;
      popup.querySelector('#cs-popup-cite').style.display = '';
    } else {
      popup.querySelector('#cs-popup-cite').style.display = 'none';
    }
  }

  function setPopupError(msg) {
    popup.querySelector('.cs-popup-body').innerHTML = `<div class="cs-popup-error">${msg}</div>`;
    popup.querySelector('#cs-popup-footer').style.display = 'none';
  }

  function hidePopup() {
    if (popup) popup.style.display = 'none';
    currentAction = null;
  }

  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy'; btn.classList.remove('copied'); }, 1500);
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

    // Get settings
    const stored = await chrome.storage.local.get(['clawside_settings']);
    const settings = stored.clawside_settings || { gatewayPort: '18789', authToken: '' };
    const port = String(settings.gatewayPort || '18789');
    const token = String(settings.authToken || '').trim();

    // Set up streaming callback before showing popup
    let fullText = '';
    const onStreamChunk = (chunk) => {
      fullText += chunk;
      appendStreamChunk(chunk);
    };

    showPopup(action, text, null, onStreamChunk);

    try {
      let cite = '';
      if (action === 'translate') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        const targetLang = settings.language && settings.language !== 'auto'
          ? settings.language
          : (navigator.language?.startsWith('zh') ? 'Chinese'
             : navigator.language?.startsWith('ja') ? 'Japanese'
             : 'English');
        const prompt = `You are a professional translator. Translate the following text to ${targetLang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: ${text}`;
        await apiCall(prompt, port, token);

      } else if (action === 'summarize') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        const lang = settings.language && settings.language !== "auto" ? settings.language : "English";
        const prompt = `You are a page summarizer. Summarize the following webpage content in 3-5 clear sentences in ${lang}. Focus on the main points and key information. Only output the summary, nothing else.\n\nPage URL: ${url}`;
        await apiCall(prompt, port, token);

      } else if (action === 'ask') {
        cite = url.length > 40 ? url.slice(0, 3) + '...' + url.slice(-37) : url;
        let prompt;
        if (text) {
          const lang = settings.language && settings.language !== "auto" ? settings.language : "English";
          prompt = `You are a helpful assistant. Answer in ${lang}. The user selected this text from a webpage:\n\n"${text}"\n\nPage: ${url}\n\nUser question: ${question || 'Please analyze and explain the selected text.'}`;
        } else {
          const lang = settings.language && settings.language !== "auto" ? settings.language : "English";
          prompt = `You are a helpful assistant. Answer in ${lang}. The user is viewing this page: ${url}\n\nUser question: ${question || 'Please summarize this page.'}`;
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

  // Hide on outside click / escape
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
    // For ask, use a default question
    doAction(action, text, window.location.href, document.title, null);
    hideBubble();
  });

  // Listen for API results from background script
  // === Message listener (handles streaming from background) ===
  chrome.runtime.onMessage.addListener((msg) => {
    // Streaming chunk: append to result
    if (msg.type === 'clawside-stream-chunk') {
      const req = pendingRequests.get(msg.requestId);
      if (req && typeof req.onChunk === 'function') {
        req.onChunk(msg.content);
      }
      return true;
    }
    // Streaming done: resolve with accumulated text
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
    // Streaming error: reject
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
  let isScrolling = false;

  function stickDock() {
    if (!dock) return;
    dock.classList.add('sticking');
    dock.classList.remove('scrolling');
    isSticking = true;
    isScrolling = false;
  }

  function unstickingDock() {
    if (!dock) return;
    dock.classList.remove('sticking');
    isSticking = false;
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (isSticking) return; // already sticking
    isScrolling = true;
    if (dock) dock.classList.add('scrolling');
    idleTimer = setTimeout(() => {
      isScrolling = false;
      if (dock) dock.classList.remove('scrolling');
      stickDock();
    }, 1000); // 1s idle before sticking
  }

  function createDock() {
    if (dock) return;
    dock = document.createElement('button');
    dock.className = 'cs-dock';
    dock.id = 'cs-dock';
    dock.title = 'ClawSide';
    dock.innerHTML = '<span class=cs-dock-tooltip>ClawSide</span>';
    dock.style.background = 'url("data:image/png;base64,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") center/contain no-repeat transparent';

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
      // Start idle timer after drag
      resetIdleTimer();
    });

    // Click to open side panel
    dock.addEventListener('click', (e) => {
      if (isDragging) return;
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'open-sidepanel' }).catch(() => {});
    });

    document.body.appendChild(dock);

    // Scroll detection - detach while scrolling, re-stick after 1s idle
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      if (!isSticking) {
        resetIdleTimer();
      } else {
        // Temporarily detach while scrolling
        dock.classList.remove('sticking');
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          stickDock();
        }, 1000);
      }
    }, { passive: true });

    // Initial stick after 1s
    idleTimer = setTimeout(stickDock, 1000);
  }

  // Init

})();
