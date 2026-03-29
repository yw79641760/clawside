// ClawSide - Service Worker (Background)
// Handles message routing, panel behavior, and forwards API calls to tools/openclaw.js.

import { apiStream, apiNonStream } from './tools/openclaw.js';

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
        // Panel open → close it
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
        // Panel closed → open it
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
    const { prompt, port, token, requestId, stream = true, toolName = 'default' } = msg;
    if (stream) {
      apiStream(prompt, port, token, requestId, toolName).catch((err) => {
        chrome.runtime.sendMessage({ type: 'clawside-stream-error', requestId, error: err.message }).catch(() => {});
      });
    } else {
      apiNonStream(prompt, port, token, requestId, toolName).catch((err) => {
        chrome.runtime.sendMessage({ type: 'clawside-api-error', requestId, error: err.message }).catch(() => {});
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  // Floating-ball radial menu: open panel + jump to a specific tool tab
  if (msg.type === 'panel-open-with-tab') {
    const { tab, url, title, text } = msg;
    chrome.storage.local.set({
      _pendingTab: tab,
      _pendingUrl: url || '',
      _pendingTitle: title || '',
      _pendingText: text || ''
    });
    chrome.windows.getCurrent((win) => {
      if (win?.id) chrome.sidePanel.open({ windowId: win.id });
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

  return true;
});

// === Broadcast panel-state to content scripts (panel closed by any means) ===
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'sidepanel-closed') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'panel-state', open: false }).catch(() => {});
      });
    });
    return true;
  }
  return true;
});

// === Tab Switch Events ===
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    chrome.runtime.sendMessage({
      type: 'text_selected', text: '', url: tab.url || '', title: tab.title || ''
    }).catch(() => {});
  } catch {}
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    chrome.runtime.sendMessage({
      type: 'text_selected', text: '', url: changeInfo.url || tab.url || '',
      title: changeInfo.title || tab.title || ''
    }).catch(() => {});
  }
});
