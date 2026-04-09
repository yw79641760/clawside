// ClawSide - Service Worker (Background)
// Handles message routing, panel behavior, and forwards API calls to tools/openai-compatible.js.

import { apiStream, apiCall, getModels } from './src/tools/openai-compatible.js';

// Cached side panel tab ID — registered by the panel itself on load.
// Kept in storage so the SW can persist it across restarts.
let _panelTabId = null;

// === Initialize Side Panel behavior ===
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
  console.error('[ClawSide] setPanelBehavior error:', err);
});

// === Open side panel on extension action icon click ===
chrome.action?.onClicked?.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// === Toggle side panel (Ctrl+Shift+P) ===
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_sidePanel') {
    chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).then((contexts) => {
      if (contexts.length > 0) {
        // Panel open -- close it
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
          const sidePanelTab = tabs.find((t) => t.url?.includes('sidepanel'));
          if (sidePanelTab?.id) {
            chrome.scripting.executeScript({
              target: { tabId: sidePanelTab.id },
              func: () => { window.close(); }
            }).catch(() => {
              chrome.tabs.remove(sidePanelTab.id).catch(() => {});
            });
          }
        });
      } else {
        // Panel closed -- open it
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (tab?.windowId) {
            chrome.sidePanel.open({ windowId: tab.windowId });
          }
        });
      }
    });
  }
});

// === API calls (streaming + non-streaming) ===
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'clawside-api') {
    const { prompt, systemPrompt, requestId, stream = true, toolName = 'default', sourceTabId } = msg;

    // Get settings from storage (port, token, model)
    chrome.storage.local.get(['clawside_settings']).then((result) => {
      const settings = result.clawside_settings || {};
      const port = settings.gatewayPort || '18789';
      const token = settings.authToken || '';
      const model = settings.model || 'openclaw';

      if (stream) {
        apiStream(prompt, systemPrompt, port, token, requestId, toolName, model, sourceTabId).catch((err) => {
          chrome.runtime.sendMessage({ type: 'clawside-stream-error', requestId, error: err.message }).catch(() => {});
        });
      } else {
        apiCall(prompt, systemPrompt, port, token, toolName, model, requestId).then((result) => {
          chrome.runtime.sendMessage({ type: 'clawside-api-result', requestId, result }).catch(() => {});
        }).catch((err) => {
          chrome.runtime.sendMessage({ type: 'clawside-api-error', requestId, error: err.message }).catch(() => {});
        });
      }
    });

    sendResponse({ ok: true });
    return true;
  }

  // Get available models from gateway
  if (msg.type === 'clawside-models') {
    const { requestId } = msg;

    chrome.storage.local.get(['clawside_settings']).then((result) => {
      const settings = result.clawside_settings || {};
      const port = settings.gatewayPort || '18789';
      const token = settings.authToken || '';

      getModels(port, token).then((models) => {
        chrome.runtime.sendMessage({ type: 'clawside-models-result', requestId, models }).catch(() => {});
      }).catch((err) => {
        chrome.runtime.sendMessage({ type: 'clawside-models-error', requestId, error: err.message }).catch(() => {});
      });
    });

    sendResponse({ ok: true });
    return true;
  }

  // Scan gateway ports (auto-scan on first run) - uses apiCall
  if (msg.type === 'clawside-scan') {
    const { ports, requestId } = msg;

    // Scan each port and return results
    Promise.all(ports.map(async (port) => {
      try {
        // Phase 1: Try getModels without auth token
        let models;
        try {
          models = await getModels(port, '');
        } catch (err) {
          const errMsg = err.message || '';
          // 401/403 means auth required
          if (errMsg.includes('401') || errMsg.includes('403')) {
            return { port, authRequired: true };
          }
          // Other errors (connection refused, timeout) = port not available
          return null;
        }

        // Phase 2: Test chat completions with first model
        const model = models[0]?.id;
        if (!model) {
          // No models available, but endpoint is reachable - consider as no auth needed
          return { port, authRequired: false };
        }

        // Test chat completions with discovered model
        try {
          await apiCall('hi', '', port, '', 'default', model);
          return { port, authRequired: false };
        } catch (err) {
          const errMsg = err.message || '';
          // 401/403 means auth required
          if (errMsg.includes('401') || errMsg.includes('403')) {
            return { port, authRequired: true };
          }
          // Other errors = port not available
          return null;
        }
      } catch (err) {
        const errMsg = err.message || '';
        console.log('[ClawSide] scan port', port, 'error:', errMsg);
        // Other errors (connection refused, timeout) = port not available
        return null;
      }
    })).then((results) => {
      const found = results.filter(Boolean);
      chrome.runtime.sendMessage({ type: 'clawside-scan-result', requestId, found }).catch(() => {});
    }).catch(() => {
      chrome.runtime.sendMessage({ type: 'clawside-scan-result', requestId, found: [] }).catch(() => {});
    });

    sendResponse({ ok: true });
    return true;
  }

  // Side panel registers its own tabId on load (persisted so SW can use it after restart).
  if (msg.type === 'panel-ready' && msg.panelTabId) {
    _panelTabId = msg.panelTabId;
    chrome.storage.local.set({ _panelTabId: msg.panelTabId });
    // Pending tab data (if any) is read by the panel's own storage.onChanged listener.
    // No sendMessage needed — eliminates "channel closed" errors when panel reloads.
    sendResponse({ ok: true });
    return true;
  }

  // Floating-ball radial menu: open panel + jump to a specific tool tab.
  // Communication is purely via chrome.storage.local — the panel reads
  // pending data via its storage.onChanged listener (handlePendingTab).
  // No direct chrome.tabs.sendMessage, which fails when the panel refreshes.
  if (msg.type === 'panel-open-with-tab') {
    const { tab, url, title, text, action, messages } = msg;
    chrome.storage.local.set({
      _pendingTab:   tab,
      _pendingUrl:   url   || '',
      _pendingTitle: title || '',
      _pendingText:  text  || '',
      _pendingAction: action || null,
      _pendingMessages: messages || null,
    });

    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT }).catch((err) => {
      console.error('[ClawSide] sidePanel.open error:', err);
    });
    sendResponse({ ok: true });
    return true;
  }

  // Forward tab-switch message to an already-open side panel
  if (msg.type === 'OPEN_TAB_IN_PANEL') {
    chrome.storage.local.set({
      _pendingTab: msg.tab,
      _pendingUrl: msg.url || '',
      _pendingTitle: msg.title || '',
      _pendingText: msg.text || ''
    });
    return true;
  }

  // Content script bootstrap: request current active tab info.
  // chrome.tabs is not available in MV3 content scripts — this bridges the gap.
  if (msg.type === 'get_current_tab') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0]) {
        var t = tabs[0];
        sendResponse({
          id:     t.id,
          url:    t.url    || '',
          title:  t.title  || '',
          favicon: t.favIconUrl || ''
        });
      } else {
        sendResponse(null);
      }
    });
    return true; // keep message channel open for async sendResponse
  }

  return true;
});

// === Broadcast panel-state to content scripts (panel closed by any means) ===
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'sidepanel-closed') {
    _panelTabId = null;
    chrome.storage.local.remove(['_panelTabId']);
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'panel-state', open: false }).catch(() => {});
      });
    });
    return true;
  }
  return true;
});

// === Tab Switch / Update Events → forward to content scripts ===
// All chrome.tabs.* listeners live HERE (background/SW), NOT in content scripts.
// MV3 content scripts cannot access chrome.tabs API.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    chrome.tabs.sendMessage(activeInfo.tabId, {
      type: 'tabctx-activated', tabId: activeInfo.tabId,
      url: tab.url || '', title: tab.title || '', favicon: tab.favIconUrl || ''
    }).catch(() => {});
  } catch {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    chrome.tabs.sendMessage(tabId, {
      type: 'tabctx-updated', tabId,
      url: changeInfo.url || tab.url || '',
      title: changeInfo.title || tab.title || '',
      favicon: tab.favIconUrl || ''
    }).catch(() => {});
  }
});

chrome.webNavigation?.onHistoryStateUpdated.addListener((navInfo) => {
  chrome.tabs.get(navInfo.tabId).then((tab) => {
    chrome.tabs.sendMessage(navInfo.tabId, {
      type: 'tabctx-updated', tabId: navInfo.tabId,
      url: tab.url || '', title: tab.title || '', favicon: tab.favIconUrl || ''
    }).catch(() => {});
  }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'tabctx-removed', tabId }).catch(() => {});
      }
    });
  });
});
