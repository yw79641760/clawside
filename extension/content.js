// ClawSide - Content Script
// Shows floating action bubble on text selection

(function () {
  'use strict';

  let lastSelectedText = '';
  let bubble = null;
  let hideTimer = null;

  // Check if we're in the side panel (extension URL)
  if (window.location.protocol === 'chrome-extension:') {
    return;
  }

  // === Bubble UI ===
  function createBubble() {
    const existing = document.getElementById('clawside-bubble');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'clawside-bubble';
    el.innerHTML = `
      <button class="cs-btn" id="cs-btn-translate" title="翻译">🌐</button>
      <button class="cs-btn" id="cs-btn-summarize" title="总结">📄</button>
      <button class="cs-btn" id="cs-btn-ask" title="提问">💬</button>
    `;

    // Inject styles
    if (!document.getElementById('clawside-styles')) {
      const style = document.createElement('style');
      style.id = 'clawside-styles';
      style.textContent = `
        #clawside-bubble {
          position: fixed;
          z-index: 2147483647;
          display: flex;
          gap: 4px;
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 5px 7px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          font-family: system-ui, -apple-system, sans-serif;
          animation: cs-fade-in 150ms ease-out;
        }
        @keyframes cs-fade-in {
          from { opacity: 0; transform: translateY(4px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .cs-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 120ms ease;
          padding: 0;
        }
        .cs-btn:hover {
          background: #2d333b;
        }
        .cs-btn:active {
          background: #3d444d;
          transform: scale(0.94);
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(el);
    return el;
  }

  function positionBubble(bubble, rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = 120; // approximate bubble width
    const bh = 44;  // approximate bubble height
    const gap = 8;

    // Default: below selection, centered
    let top = rect.bottom + gap + window.scrollY;
    let left = rect.left + window.scrollX + rect.width / 2 - bw / 2;

    // If too low, show above
    if (rect.bottom + gap + bh > vh - 20) {
      top = rect.top + window.scrollY - bh - gap;
    }

    // Clamp horizontal
    left = Math.max(8, Math.min(left, vw - bw - 8));

    bubble.style.top = top + 'px';
    bubble.style.left = left + 'px';
  }

  function showBubble(text, rect) {
    if (!text || !rect) {
      hideBubble();
      return;
    }

    if (!bubble) {
      bubble = createBubble();
    }

    positionBubble(bubble, rect);
    bubble.style.display = 'flex';

    // Attach button handlers
    const sendAction = (action) => {
      chrome.runtime.sendMessage({
        type: 'clawside-action',
        action: 'clawside-' + action,
        text: text,
        url: window.location.href,
        title: document.title
      });
      // Open side panel
      chrome.runtime.sendMessage({ type: 'open-sidepanel' });
    };

    bubble.querySelector('#cs-btn-translate').onclick = () => sendAction('translate');
    bubble.querySelector('#cs-btn-summarize').onclick = () => sendAction('summarize');
    bubble.querySelector('#cs-btn-ask').onclick = () => sendAction('ask');
  }

  function hideBubble() {
    if (bubble) {
      bubble.style.display = 'none';
    }
    clearTimeout(hideTimer);
  }

  // === Selection handling ===
  function handleSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';

    if (!text || text === lastSelectedText) {
      // Same selection or empty, do nothing extra
      return;
    }

    lastSelectedText = text;

    // Get bounding rect of selection
    const range = selection?.getRangeAt(0);
    if (!range) return;

    const rect = range.getBoundingClientRect();

    // Small rect means invalid selection
    if (rect.width < 10 || rect.height < 5) {
      hideBubble();
      return;
    }

    // Show bubble after short delay (avoid flickering on double-click)
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      showBubble(text, rect);
    }, 300);
  }

  // Hide bubble on click elsewhere
  document.addEventListener('mousedown', (e) => {
    // Don't hide if clicking inside bubble
    if (bubble && bubble.contains(e.target)) return;
    // Don't hide if clicking in side panel
    if (e.target.closest?.('chrome-extension://')) return;
    hideBubble();
  });

  // Track selection changes
  document.addEventListener('mouseup', () => {
    setTimeout(handleSelection, 10);
  });

  // Also handle selection via keyboard
  document.addEventListener('selectionchange', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(handleSelection, 300);
  });

  // Listen for messages from side panel
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'get_selection') {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      lastSelectedText = text;

      chrome.runtime.sendMessage({
        type: 'text_selected',
        text: text,
        url: window.location.href,
        title: document.title
      }).catch(() => {});

      sendResponse({ ok: true });
    }
    return true;
  });

  // Signal ready
  chrome.runtime.sendMessage({
    type: 'content_ready',
    url: window.location.href,
    title: document.title
  }).catch(() => {});
})();
