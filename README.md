<div style="text-align: center">
  <picture>
    <img src="extension/assets/icons/icon128.png" width="128" alt="ClawSide Logo">
  </picture>
  <h1>ClawSide</h1>
  <p>Supercharge browsing with local AI</p>
</div>


[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-Google%20Chrome?style=flat&logo=google-chrome&color=4285F4)](https://chrome.google.com/webstore/detail/clawside)
[![License](https://img.shields.io/github/license/yw79641760/clawside?color=MIT)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20114%2B-4285F4)]()
[![Extension](https://img.shields.io/badge/Manifest-V3-34A853)]()
[![Last Updated](https://img.shields.io/github/last-commit/yw79641760/clawside?color=orange)]()

- Completely local, privacy protected
- Practical tools, double your efficiency
- Agent-friendly, supports OpenClaw/Hermes/OpenFang and more

## Architecture

```
Chrome Page
  ├─ Floating bubble (content script) → small inline popup with result
  └─ Side panel (extension icon) → full-featured standalone panel
       ↓ HTTP (chrome-extension → 127.0.0.1:18789)
       OpenClaw Gateway → LLM
```

Four interaction modes:
1. **Floating bubble**: Select text → bubble appears → click icon → result in popup
2. **Radial menu**: Long press on bubble → radial menu with translate/summarize/ask
3. **Global page translation**: Click translate in radial menu → translate entire page with loading placeholders
4. **Full side panel**: Click extension icon → full Translate/Summarize/Ask/History interface

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
openclaw gateway restart
```

## Quick Start

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** → **Load unpacked** → select `extension/`
3. Select text on any page → floating bubble appears → click an icon
4. Or click extension icon → **Open side panel** (full features)

## Features

### Floating Bubble (Quick)
Select text on any page → floating bubble appears → click an icon:
- 🌐 **Translate** — translated text in popup
- 📄 **Summarize** — page summary in popup (auto-triggers if no existing result)
- 💬 **Ask** — answer in popup

### Radial Menu
Long press/right-click on bubble → radial menu with tool buttons:
- 🌐 Translate
- 📄 Summarize
- 💬 Ask

Clicking a tool opens the side panel to the corresponding tab.

### Global Page Translation
Click 🌐 Translate in radial menu to translate all paragraphs on the current page:
- Shows loading placeholder for each paragraph
- Batch translates 10 paragraphs at a time
- Shows error icon if translation times out
- Click again to hide (without re-requesting LLM)
- Click again to re-show the previous translations

### Full Side Panel
Click the ClawSide extension icon in toolbar:
- 🌐 **Translate** — translate selected text, choose target language
- 📄 **Summarize** — summarize current page, click ask icon to jump to Ask with context
- 💬 **Ask** — ask custom questions, Ctrl+Enter to send, chat history preserved per tab+URL
- 📜 **History** — view all past interactions, expand to see details

### Popup Ask Transfer
In popup ask (floating bubble 💬), after having a conversation:
- Click the **open-external** icon (top-right) to transfer chat history to side panel's Ask tab
- Conversation continues seamlessly in the full side panel
- Chat history is saved per tab+URL in local storage

### Ask from Summarize
In summarize result header, click the ask icon to:
- Jump to Ask tab
- Load summarize result as conversation context
- Auto-scroll to input box

### Settings
Click ⚙️ in side panel:
- Gateway Port (default: `18789`)
- Auth Token (if your gateway requires it)
- Language preference
- Tool prompt customization
- Appearance (system/light/dark)

## Troubleshooting

### "Failed to fetch" / Network error
- Is OpenClaw Gateway running? `curl http://127.0.0.1:18789/`
- Is `chatCompletions.enabled: true` in config?
- Restart OpenClaw after changing config

### 401 Unauthorized
- Enter your gateway token in ⚙️ settings

### Bubble doesn't appear on text selection
- Reload the extension: `chrome://extensions/` → reload icon
- Check console for errors (Content script may have failed to load)

### Streaming not working
- Ensure you're using `chrome.runtime.onMessage` instead of `chrome.tabs.onMessage` in content scripts

## Requirements

- Chrome 114+ (side panel API)
- OpenClaw Gateway running locally
- `gateway.http.endpoints.chatCompletions.enabled: true`

## Chrome Web Store

To publish to Chrome Web Store:
1. Run `npm run build` to generate production bundle
2. Zip the `extension/dist` folder
3. Upload via [Chrome Developer Dashboard](https://developer.chrome.com/docs/extensions/publish)

## License

[MIT](LICENSE)
