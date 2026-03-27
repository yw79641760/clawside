// ClawSide - Service Worker (Background)
// Handles API calls (streaming + non-streaming) + message routing

// === Streaming API Call ===
async function apiStream(prompt, port, token, requestId, toolName = 'default') {
  port = String(port || '18789');
  token = String(token || '').trim();
  const user = 'clawside:' + toolName;  // Gateway derives session from user field

  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      model: 'openclaw/main',
      user,  // Session复用 key — same toolName → same session
      messages: [{ role: 'user', content: prompt }],
      stream: true
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  // Read SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        chrome.runtime.sendMessage({ type: 'clawside-stream-done', requestId }).catch(() => {});
        return;
      }
      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content || '';
        if (content) {
          chrome.runtime.sendMessage({ type: 'clawside-stream-chunk', requestId, content }).catch(() => {});
        }
      } catch {}
    }
  }

  // Handle any remaining buffer
  if (buffer.startsWith('data: ') && buffer.slice(6).trim() !== '[DONE]') {
    try {
      const json = JSON.parse(buffer.slice(6).trim());
      const content = json.choices?.[0]?.delta?.content || '';
      if (content) {
        chrome.runtime.sendMessage({ type: 'clawside-stream-chunk', requestId, content }).catch(() => {});
      }
    } catch {}
  }

  chrome.runtime.sendMessage({ type: 'clawside-stream-done', requestId }).catch(() => {});
}

// === Non-streaming API Call (for tests) ===
async function apiNonStream(prompt, port, token, requestId, toolName = 'default') {
  port = String(port || '18789');
  token = String(token || '').trim();
  const user = 'clawside:' + toolName;

  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      model: 'openclaw/main',
      user,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const result = data.choices?.[0]?.message?.content?.trim() || '';
  chrome.runtime.sendMessage({ type: 'clawside-api-result', requestId, result }).catch(() => {});
}
async function apiCall(prompt, port, token, toolName = 'default') {
  port = String(port || '18789');
  token = String(token || '').trim();
  const user = 'clawside:' + toolName;

  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      model: 'openclaw/main',
      user,
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

// === Panel Toggle State ===
let panelOpen = false;

// === Message Routing ===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'clawside-api') {
    const { prompt, port, token, requestId, stream = true, toolName = 'default' } = msg;
    if (stream) {
      // Streaming mode
      apiStream(prompt, port, token, requestId, toolName).catch((err) => {
        chrome.runtime.sendMessage({ type: 'clawside-stream-error', requestId, error: err.message }).catch(() => {});
      });
    } else {
      // Non-streaming mode (for connection test)
      apiNonStream(prompt, port, token, requestId, toolName).catch((err) => {
        chrome.runtime.sendMessage({ type: 'clawside-api-error', requestId, error: err.message }).catch(() => {});
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'toggle-sidepanel') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (panelOpen) {
        // Close panel
        chrome.sidePanel.setOptions({ enabled: false, tabId }).then(() => {
          panelOpen = false;
          broadcastPanelState(false);
        }).catch((err) => {
          console.error('[ClawSide] sidePanel.close error:', err);
        });
      } else {
        // Open panel
        chrome.sidePanel.open({ tabId }).then(() => {
          panelOpen = true;
          broadcastPanelState(true);
        }).catch((err) => {
          console.error('[ClawSide] sidePanel.open error:', err);
        });
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'get-panel-state') {
    sendResponse({ open: panelOpen });
    return true;
  }

  if (msg.type === 'sidepanel-closed') {
    // Panel was closed by user (ESC, click outside, etc.) — reset state
    panelOpen = false;
    broadcastPanelState(false);
    return true;
  }

  // No need to broadcast text_selected/content_ready - content scripts handle selection themselves
  return true;
});

// Broadcast panel state to all content scripts
function broadcastPanelState(open) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'panel-state', open }).catch(() => {});
    });
  });
}

// === Tab Switch Events ===
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    chrome.runtime.sendMessage({
      type: 'text_selected', text: '', url: tab.url || '', title: tab.title || ''
    }).catch(() => {});
  } catch {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    chrome.runtime.sendMessage({
      type: 'text_selected', text: '', url: changeInfo.url || tab.url || '',
      title: changeInfo.title || tab.title || ''
    }).catch(() => {});
  }
});

// Open side panel on extension icon click
chrome.action?.onClicked?.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
