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
  let settings = { gatewayPort: '18789', authToken: '', language: 'auto' };

  // Load settings from storage
  chrome.storage.local.get(['clawside_settings']).then((result) => {
    if (result.clawside_settings) {
      settings = { ...settings, ...result.clawside_settings };
    }
  });

  // === Styles ===
  function injectStyles() {
    if (document.getElementById('clawside-styles')) return;
    const s = document.createElement('style');
    s.id = 'clawside-styles';
    s.textContent = `
      .cs-bubble {
        position: fixed; z-index: 2147483647;
        display: flex; gap: 4px;
        background: #161b22; border: 1px solid #30363d;
        border-radius: 8px; padding: 5px 7px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.45);
        font-family: system-ui, -apple-system, sans-serif;
        animation: cs-bubble-in 150ms ease-out;
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
      .cs-btn:hover { background: #262c34; }
      .cs-btn:active { background: #32393f; transform: scale(0.92); }

      .cs-popup {
        position: fixed; z-index: 2147483647;
        width: 320px; max-height: 280px;
        background: #161b22; border: 1px solid #30363d;
        border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: system-ui, -apple-system, sans-serif;
        display: flex; flex-direction: column;
        overflow: hidden;
        animation: cs-popup-in 180ms ease-out;
      }
      @keyframes cs-popup-in {
        from { opacity: 0; transform: scale(0.9) translateY(-6px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      .cs-popup-header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px; border-bottom: 1px solid #30363d;
        background: rgba(255,255,255,0.02);
      }
      .cs-popup-icon { font-size: 14px; }
      .cs-popup-title { flex: 1; font-size: 13px; font-weight: 600; color: #e6edf3; }
      .cs-popup-close {
        width: 26px; height: 26px; border: none; background: transparent;
        border-radius: 4px; cursor: pointer; font-size: 14px;
        color: #8b949e; display: flex; align-items: center; justify-content: center;
        transition: background 100ms;
      }
      .cs-popup-close:hover { background: #262c34; color: #e6edf3; }
      .cs-popup-body {
        flex: 1; padding: 12px; overflow-y: auto;
        font-size: 13px; line-height: 1.6; color: #e6edf3;
        word-break: break-word;
      }
      .cs-popup-body::-webkit-scrollbar { width: 5px; }
      .cs-popup-body::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
      .cs-popup-footer {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px; border-top: 1px solid #30363d;
      }
      .cs-popup-cite {
        flex: 1; font-size: 11px; color: #58a6ff;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .cs-popup-copy {
        padding: 4px 10px; border: 1px solid #30363d; background: transparent;
        border-radius: 5px; cursor: pointer; font-size: 12px; color: #8b949e;
        transition: all 100ms;
      }
      .cs-popup-copy:hover { border-color: #58a6ff; color: #58a6ff; }
      .cs-popup-copy.copied { border-color: #3fb950; color: #3fb950; }

      .cs-popup-loading {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 10px; padding: 28px 16px; color: #8b949e;
        font-size: 13px;
      }
      .cs-spinner {
        width: 22px; height: 22px; border: 2px solid #30363d;
        border-top-color: #58a6ff; border-radius: 50%;
        animation: cs-spin 600ms linear infinite;
      }
      @keyframes cs-spin { to { transform: rotate(360deg); } }

      .cs-popup-error {
        padding: 12px; color: #f85149; font-size: 13px;
      }

      /* === Persistent Dock Ball === */
      .cs-dock {
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483646;
        width: 48px; height: 48px; border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        box-shadow: 0 4px 20px rgba(102, 126, 234, 0.45);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 22px; transition: transform 0.2s, box-shadow 0.2s;
        user-select: none; border: none;
      }
      .cs-dock:hover {
        transform: scale(1.12);
        box-shadow: 0 6px 28px rgba(102, 126, 234, 0.6);
      }
      .cs-dock:active {
        transform: scale(0.95);
      }
      .cs-dock-tooltip {
        position: absolute; right: 58px; bottom: 6px;
        background: #161b22; border: 1px solid #30363d;
        color: #c9d1d9; font-size: 13px; white-space: nowrap;
        padding: 6px 12px; border-radius: 8px;
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
  function createDock() {
    if (dock) return;
    dock = document.createElement('button');
    dock.className = 'cs-dock';
    dock.id = 'cs-dock';
    dock.title = 'ClawSide';
    dock.innerHTML = '🦖<span class=cs-dock-tooltip>ClawSide</span>';
    dock.addEventListener('click', (e) => {
      e.stopPropagation();
      // sidePanel.open must be called sync to user gesture, so use sendMessage to bg
      // and bg calls sidePanel.open synchronously (setTimeout 0 keeps it in same task)
      chrome.runtime.sendMessage({ type: 'open-sidepanel' }).catch((err) => {
        console.error('[ClawSide] sendMessage error:', err);
      });
    });
    document.body.appendChild(dock);
  }

  // Init
  injectStyles();
  createDock();
  chrome.runtime.sendMessage({ type: 'content_ready', url: window.location.href, title: document.title }).catch(() => {});
})();
