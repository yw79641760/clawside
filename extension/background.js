// ClawSide - Service Worker (Background)
// Handles message routing between content script and side panel

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Forward content script messages to side panel
  if (msg.type === 'text_selected' || msg.type === 'page_info' || msg.type === 'content_ready') {
    chrome.runtime.sendMessage(msg).catch(() => {
      // Side panel not open, ignore
    });
  }
  return true;
});

// Open side panel when extension icon is clicked
chrome.action?.onClicked?.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
