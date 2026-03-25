// ClawSide - Content Script
// Captures text selection and page info, sends to side panel

(function () {
  'use strict';

  let lastSelectedText = '';

  // Listen for text selection
  document.addEventListener('mouseup', () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';

    if (text && text !== lastSelectedText) {
      lastSelectedText = text;

      // Notify side panel
      chrome.runtime.sendMessage({
        type: 'text_selected',
        text: text,
        url: window.location.href,
        title: document.title
      }).catch(() => {
        // Side panel may not be open
      });
    }
  });

  // Also listen for custom selection events (from other scripts)
  document.addEventListener('selectionchange', () => {
    // Debounced in mouseup handler
  });

  // Listen for requests from side panel
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

  // Signal that content script is ready
  chrome.runtime.sendMessage({
    type: 'content_ready',
    url: window.location.href,
    title: document.title
  }).catch(() => {});
})();
