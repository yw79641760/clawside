// ClawSide - Service Worker (Background)
// Handles API calls (fetch to Gateway) + message routing

// API call runs here (not in content script) for better security
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
  // API call request from content script or side panel
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

  // From floating bubble → handle bubble action (no longer auto-open side panel)
  if (msg.type === 'clawside-action') {
    // Handled by content script directly now
  }

  if (msg.type === 'open-sidepanel') {
    chrome.sidePanel.open({}).catch(() => {});
  }

  if (msg.type === 'text_selected' || msg.type === 'page_info' || msg.type === 'content_ready') {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  return true;
});

// Open side panel when extension icon is clicked
chrome.action?.onClicked?.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
