# CLAUDE.md

This file provides guidance to AI Agents when working with code in this repository.

## Project Overview

ClawSide is a Chrome side panel extension that bridges your browser to a local OpenClaw gateway. Select text anywhere → floating bubble → instant translate/summarize/ask, or use the full side panel for more features.

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
Chrome Extension (Extension Page/Side Panel/Content Script)
         ↓ HTTP POST (chrome.runtime.sendMessage)
Chrome Background Service Worker (background.js)
         ↓ HTTP POST (fetch)
OpenClaw Gateway (127.0.0.1:18789/v1/chat/completions)
         ↓
LLM Provider (configured in OpenClaw)
```

## Key Components

- **extension/src/components/sidepanel.js** - Main side panel UI, handles Translate/Summarize/Ask/History tabs, chat functionality
- **extension/src/components/popup.js** - Floating bubble UI (inline popup when text is selected)
- **extension/src/shared/chat-session.js** - Chat session management with per-tab+url conversation history
- **extension/src/shared/panel-context.js** - Manages current page context (URL, title, content, selected text)
- **extension/src/shared/tab-context-manager.js** - Manages all tab contexts with LRU cache
- **extension/src/tools/openclaw.js** - HTTP client for OpenClaw gateway (buildUrl, buildHeaders, apiCall, apiStream)
- **extension/src/tools/lru-cache.js** - Generic LRU cache base class
- **extension/background.js** - Service worker, routes messages between extension pages and gateway

## OpenClaw Gateway Integration

The extension communicates with OpenClaw via the `/v1/chat/completions` endpoint:
- Default port: `18789`
- Auth: Bearer token (if gateway has `auth.mode: "token"`)
- Model: `openclaw/main`
- Content-Type: `application/json`

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