# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Project Overview

ClawSide is a Chrome side panel extension that bridges your browser to a local OpenClaw gateway. Select text anywhere → floating bubble → instant translate/summarize/ask, or use the full side panel for more features. Also supports global page translation via radial menu.

## Development Commands

```bash
# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" → select extension/

# Test gateway connectivity
curl http://127.0.0.1:18789/health

# Restart OpenClaw gateway
openclaw gateway restart
```

## Architecture

```
Chrome Extension (Content Script / Floating Bubble / Radial Menu / Side Panel)
         ↓ HTTP POST (chrome.runtime.sendMessage)
Chrome Background Service Worker (background.js)
         ↓ HTTP POST (fetch)
OpenClaw Gateway (127.0.0.1:18789/v1/chat/completions)
         ↓
LLM Provider (configured in OpenClaw)
```

## Key Components

- **extension/src/components/sidepanel.js** - Main side panel UI, handles Translate/Summarize/Ask/History tabs, chat functionality, auto-trigger summarize
- **extension/src/components/popup.js** - Floating bubble UI (inline popup when text is selected), handles action dispatch to side panel
- **extension/src/components/dock.js** - Radial menu (long-press on bubble), global page translation, opens side panel with specific tool tab
- **extension/src/shared/chat-session.js** - Chat session management with per-tab+url conversation history
- **extension/src/shared/panel-context.js** - Manages current page context (URL, title, content, selected text)
- **extension/src/shared/tab-context-manager.js** - Manages all tab contexts with LRU cache, handles content extraction
- **extension/src/shared/settings.js** - Unified settings management (gateway port, auth token, language, tool prompts)
- **extension/src/tools/openclaw.js** - HTTP client for OpenClaw gateway (buildUrl, buildHeaders, apiCall, apiStream)
- **extension/src/tools/lru-cache.js** - Generic LRU cache base class
- **extension/src/tools/chat-lru-cache.js** - Chat message persistence with LRU eviction (max 50 conversations)
- **extension/src/tools/context-lru-cache.js** - Tab context storage with LRU cache
- **extension/src/tools/icons.js** - SVG icon system with injectSprite for inline SVG
- **extension/src/tools/page.js** - Page parser & translation injector, handles global page translation with loading/error placeholders
- **extension/src/tools/appearance.js** - Theme handling and CSS injection for content scripts
- **extension/background.js** - Service worker, routes messages between extension pages and gateway

## Storage Keys

- `clawside_settings` - User settings (gateway port, auth token, language, tool prompts)
- `clawside_chat_{tabId}_{urlHash}` - Chat history per tab+URL (max 50 conversations)
- `clawside_summarize_{tabId}_{urlHash}` - Summarize results per tab+URL
- `_pendingTab`, `_pendingUrl`, `_pendingTitle`, `_pendingText`, `_pendingAction`, `_pendingMessages` - Temporary storage for panel-open flow (includes chat messages when transferring from popup ask)
- `_tabCtxData`, `_tabCtxVersion` - Tab context persistence (internal use by tab-context-manager.js)

## Popup to Side Panel Communication

When clicking the open-external button in popup ask:
1. Popup stores `_pendingAction: 'ask'` and `_pendingMessages` (chat history array) in chrome.storage.local
2. Background receives the message and calls `chrome.sidePanel.open()`
3. Side panel reads storage, detects `_pendingAction`, and opens the ask tab
4. Chat messages are loaded into chat session via `chatSessionManager.getSession()` and saved to `clawside_chat_{tabId}_{urlHash}`
5. Pending storage is cleared after processing

This mechanism also applies to translate/summarize actions (without messages).

## OpenClaw Gateway Integration

The extension communicates with OpenClaw via the `/v1/chat/completions` endpoint:
- Default port: `18789`
- Auth: Bearer token (if gateway has `auth.mode: "token"`)
- Model: `openclaw/main`
- Content-Type: `application/json`
- Session: `openai-user:clawside:{toolName}` (toolName: default, translate, summarize, ask)

**Required OpenClaw config** (`~/.openclaw/openclaw.json`):
```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

**Note on authentication**: The gateway defaults to no auth mode. If you enable token auth (`auth.mode: "token"`), ensure the token is valid. Unlike WebSocket connections, HTTP Bearer token requests automatically receive default operator scopes.

## Important Notes

- Chat uses plain text prompt format (not JSON messages), with "User:"/"Assistant:" prefix and "Assistant:" tail for better LLM adherence
- Page content is truncated to 12k characters for Ask context (TCM often caps at ~10k)
- Settings stored in `chrome.storage.local` under `clawside_settings` key
- Chat history stored per-tab+url: `clawside_chat_{tabId}_{urlHash}`, max 50 conversations with LRU eviction
- Tab context stored per-tab: uses ContextLRUCache with maxMapSize 50, maxLruSize 10
- Floating bubble: clicking translate/summarize/ask sends action to side panel via storage
- Radial menu (dock.js): long-press on bubble opens menu, clicking a tool opens side panel to that tab
- Auto-trigger summarize: when opening side panel via summarize action with no existing result, automatically triggers summarize
- Global page translation: click translate in radial menu to translate all paragraphs on the page, with loading/error placeholders for each paragraph
- Translation toggle: clicking translate again when translation is showing will hide it; clicking when hidden will re-show without re-requesting LLM
- Popup ask transfer: when clicking open-external in popup ask, chat history is passed via `_pendingMessages` storage to side panel's ask tab, preserving conversation continuity