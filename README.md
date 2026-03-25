# ClawSide

Chrome side panel extension that connects your browser directly to local OpenClaw Gateway for translation, summarization, and interaction memory.

## Architecture

```
Chrome Side Panel
    ↓ HTTP POST (chrome-extension → 127.0.0.1:18789)
OpenClaw Gateway (direct /v1/chat/completions call)
    ↓
LLM (configured provider: GLM-5 via Minimax)
```

No bridge server needed — the extension calls OpenClaw Gateway's HTTP endpoint directly.

## Prerequisites

### 1. Enable OpenClaw HTTP Endpoint

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

### 2. Load the Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension icon 🧩 in toolbar → **Open side panel**

## Configuration

Click ⚙️ in the ClawSide side panel:

- **OpenClaw Gateway Port**: `18789` (default)
- **Gateway Auth Token**: Leave empty if your gateway has no token auth; otherwise enter the token from `gateway.auth.token` in your `openclaw.json`

## Features

### 🌐 Translate
Select text on any page → click **Translate** in the side panel.

### 📄 Summarize
Click **Summarize This Page** to get a 3-5 sentence summary.

### 📜 History
All interactions are stored locally in Chrome. View, expand, and clear history.

## Project Structure

```
clawside/
├── SPEC.md              # Design specification
├── README.md
└── extension/
    ├── manifest.json    # Chrome extension (Manifest V3)
    ├── background.js     # Service worker
    ├── content.js        # Content script (selection capture)
    ├── sidepanel.html    # Side panel UI
    ├── sidepanel.css     # Styles
    ├── sidepanel.js      # UI logic (direct Gateway HTTP calls)
    └── icons/            # Extension icons
```

## How It Works

1. **Content script** (`content.js`) captures text selection on any page via `mouseup` events
2. **Side panel** (`sidepanel.js`) receives selected text via `chrome.runtime.sendMessage`
3. **Direct HTTP call** to `http://127.0.0.1:18789/v1/chat/completions`
4. **Response** displayed in the side panel and saved to `chrome.storage.local`

## Troubleshooting

### "Failed to fetch" / Network error
- Is OpenClaw Gateway running? Check: `curl http://127.0.0.1:18789/`
- Is `chatCompletions.enabled: true` set in config?
- Restart OpenClaw after changing config

### 401 Unauthorized
- Your gateway requires auth. Enter the token in ⚙️ settings
- Token found at: `gateway.auth.token` in `~/.openclaw/openclaw.json`

### Extension can't access localhost
- Make sure `host_permissions` includes `http://127.0.0.1:18789/*` in manifest.json
- This is already configured for Manifest V3 Chrome extensions

## Requirements

- Chrome 114+ (side panel API)
- OpenClaw Gateway running locally
- `gateway.http.endpoints.chatCompletions.enabled: true`
