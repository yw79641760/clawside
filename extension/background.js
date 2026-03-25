// ClawSide - Service Worker (Background)
// Handles message routing between content script and side panel

// === Message Routing ===
// Forward messages between content script and side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'clawside-action') {
    // From floating bubble → open side panel and handle action
    chrome.sidePanel.open({}).then(() => {
      // Forward to side panel via broadcast
      chrome.runtime.sendMessage(msg).catch(() => {});
    }).catch(() => {});
  }

  if (msg.type === 'open-sidepanel') {
    chrome.sidePanel.open({}).catch(() => {});
  }

  if (msg.type === 'text_selected' || msg.type === 'page_info' || msg.type === 'content_ready') {
    // From content script → side panel
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  return true;
});

// Open side panel when extension icon is clicked
chrome.action?.onClicked?.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
