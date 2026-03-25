// ClawSide - Service Worker (Background)
// Handles API calls + tab switch events + message routing

// === API Call ===
async function apiCall(prompt, port, token) {
  port = String(port || '18789');
  token = String(token || '').trim();

  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      model: 'openclaw/main',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// === Message Routing ===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // API call request
  if (msg.type === 'clawside-api') {
    const { prompt, port, token, requestId } = msg;
    apiCall(prompt, port, token)
      .then((result) => {
        chrome.runtime.sendMessage({ type: 'clawside-api-result', requestId, result }).catch(() => {});
      })
      .catch((err) => {
        chrome.runtime.sendMessage({ type: 'clawside-api-error', requestId, error: err.message }).catch(() => {});
      });
    sendResponse({ ok: true });
    return true;
  }

  // Open side panel
  if (msg.type === 'open-sidepanel') {
    chrome.sidePanel.open({}).catch(() => {});
  }

  // Forward messages from content script to side panel
  if (msg.type === 'text_selected' || msg.type === 'page_info' || msg.type === 'content_ready') {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  return true;
});

// === Tab Switch Events ===
// Notify side panel when user switches browser tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    chrome.runtime.sendMessage({
      type: 'text_selected',
      text: '',
      url: tab.url || '',
      title: tab.title || ''
    }).catch(() => {});
  } catch (err) {
    // Tab may not be accessible
  }
});

// Also listen for URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    chrome.runtime.sendMessage({
      type: 'text_selected',
      text: '',
      url: changeInfo.url || tab.url || '',
      title: changeInfo.title || tab.title || ''
    }).catch(() => {});
  }
});

// === Open side panel on extension icon click ===
chrome.action?.onClicked?.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
