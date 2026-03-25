// ClawSide - Service Worker (Background)
// Handles context menus and message routing

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  // Remove any existing menus
  chrome.contextMenus.removeAll(() => {
    // Create top-level menu
    chrome.contextMenus.create({
      id: 'clawside-parent',
      title: 'ClawSide',
      contexts: ['selection']
    });

    // Translate submenu
    chrome.contextMenus.create({
      id: 'clawside-translate',
      parentId: 'clawside-parent',
      title: '🌐 翻译',
      contexts: ['selection']
    });

    // Summarize submenu
    chrome.contextMenus.create({
      id: 'clawside-summarize',
      parentId: 'clawside-parent',
      title: '📄 总结',
      contexts: ['selection']
    });

    // Ask submenu
    chrome.contextMenus.create({
      id: 'clawside-ask',
      parentId: 'clawside-parent',
      title: '💬 提问',
      contexts: ['selection']
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;

  const selectedText = info.selectionText.trim();
  const pageUrl = tab?.url || '';
  const pageTitle = tab?.title || '';

  // Send message to side panel to handle the action
  // The side panel will be opened and populated
  try {
    // First, try to send to existing side panel
    chrome.runtime.sendMessage({
      type: 'clawside-action',
      action: info.menuItemId,
      text: selectedText,
      url: pageUrl,
      title: pageTitle
    }).catch(() => {
      // Side panel not open, we'll open it via sidePanel API
    });

    // Open the side panel
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (err) {
    // Fallback: just open side panel
    console.error('ClawSide context menu error:', err);
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'text_selected' || msg.type === 'page_info' || msg.type === 'content_ready') {
    chrome.runtime.sendMessage(msg).catch(() => {
      // Side panel not open
    });
  }
  return true;
});

// Also listen for action messages from side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'open-sidepanel') {
    chrome.sidePanel.open({ windowId: msg.windowId }).catch(() => {});
  }
  return true;
});

// Open side panel when extension icon is clicked
chrome.action?.onClicked?.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
