# ClawSide

Chrome side panel extension that brings OpenClaw directly into your browser. Select text → floating bubble → instant results.

## Architecture

```
Chrome Page
  ├─ Floating bubble (content script) → small inline popup with result
  └─ Side panel (extension icon) → full-featured standalone panel
       ↓ HTTP (chrome-extension → 127.0.0.1:18789)
       OpenClaw Gateway → LLM
```

Two modes:
- **Inline popup** (primary): select text → click bubble icon → result in small popup
- **Full side panel**: click extension icon → full Translate/Summarize/Ask/History interface

## Prerequisites

### Enable OpenClaw HTTP Endpoint

Add to `~/.openclaw/openclaw.json`:

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

Restart OpenClaw:
```bash
node ~/Dev/openclaw/dist/index.js gateway restart
```

## Quick Start

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** → **Load unpacked** → select `extension/`
3. Click extension icon → **Open side panel** (full features)
4. Or just select text on any page → floating bubble appears ✨

## Features

### Inline Popup (Quick)
Select text on any page → floating bubble appears → click an icon:
- 🌐 翻译 — translated text in small popup
- 📄 总结 — page summary in small popup
- 💬 提问 — answer in small popup

### Full Side Panel (via extension icon)
Click the ClawSide extension icon in toolbar:
- 🌐 **Translate** — translate selected text, choose target language
- 📄 **Summarize** — summarize current page
- 💬 **Ask** — ask custom questions, Ctrl+Enter to send
- 📜 **History** — view all past interactions, expand to see details

### Settings
Click ⚙️ in side panel:
- Gateway Port (default: `18789`)
- Auth Token (if your gateway requires it)

## Troubleshooting

### "Failed to fetch" / Network error
- Is OpenClaw Gateway running? `curl http://127.0.0.1:18789/`
- Is `chatCompletions.enabled: true` in config?
- Restart OpenClaw after changing config

### 401 Unauthorized
- Enter your gateway token in ⚙️ settings

## Requirements

- Chrome 114+ (side panel API)
- OpenClaw Gateway running locally
- `gateway.http.endpoints.chatCompletions.enabled: true`
