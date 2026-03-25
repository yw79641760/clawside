# ClawSide

Chrome side panel extension that connects your browser to local OpenClaw for translation, summarization, and interaction memory.

## Architecture

```
Chrome Side Panel (UI)
       ↓ HTTP POST (localhost:18792)
ClawSide Bridge Server (Node.js)
       ↓ HTTP /v1/chat/completions (localhost:18789)
OpenClaw Gateway
       ↓
LLM (configured provider: GLM-5 via Minimax)
```

## Quick Start

### 1. Start the Bridge Server

```bash
cd server
GATEWAY_TOKEN=84766bb99b18bd39494803027d377237fc1b2af37007726d node bridge.js
```

> Find your token: `cat ~/.openclaw/openclaw.json | grep '"token"'`

### 2. Enable OpenClaw HTTP Endpoint

Make sure your `~/.openclaw/openclaw.json` has:
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
Restart OpenClaw if you added this.

### 3. Load the Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension icon 🧩 in toolbar → **Open side panel**

### 4. Configure

1. Click ⚙️ in the ClawSide side panel
2. Set the **Bridge Server Port** (default: `18792`)
3. Click **Save Settings**

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
├── extension/
│   ├── manifest.json    # Chrome extension manifest
│   ├── background.js     # Service worker
│   ├── content.js        # Content script (selection capture)
│   ├── sidepanel.html    # Side panel UI
│   ├── sidepanel.css     # Styles
│   ├── sidepanel.js      # UI logic
│   └── icons/            # Extension icons
└── server/
    ├── package.json
    └── bridge.js         # Bridge server (HTTP → OpenClaw)
```

## Troubleshooting

### "Cannot reach OpenClaw"
- Bridge server running? `cd server && GATEWAY_TOKEN=... node bridge.js`
- Gateway running? `node ~/Dev/openclaw/dist/index.js gateway status`
- Port correct? (default 18792)

### Translation/Summarize not working
- Check OpenClaw HTTP endpoint enabled: `chatCompletions.enabled: true` in config
- Restart OpenClaw after enabling

## Requirements

- Chrome 114+ (side panel API)
- OpenClaw Gateway running locally
- Node.js 18+
