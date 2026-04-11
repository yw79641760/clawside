---
title: ClawSide
feature_text: |
  ## ClawSide 
  Supercharge browsing with local AI
feature_image: "/assets/images/hero.jpg"
excerpt: "Supercharge browsing with local AI — translate, summarize, and ask about any webpage, right from your browser."
---

{% include button.html text="Install on Chrome" icon="github" link="https://chrome.google.com/webstore/detail/clawside" color="#4285F4" %} {% include button.html text="View on GitHub" icon="github" link="https://github.com/yw79641760/clawside" color="#24292e" %}

## What is ClawSide?

ClawSide is a Chrome extension that brings your local AI assistant directly into your browser. Select text on any page to translate, summarize, or ask questions — no copy-pasting required.

Built with privacy in mind: **everything runs locally** via your own OpenAI-compatible gateway (OpenClaw, Ollama, Hermes Agent, etc.). Your data never leaves your machine.

## Features

- **🌐 Translate** — Select text to translate into any language instantly
- **📄 Summarize** — Get a quick summary of any webpage with one click
- **💬 Ask** — Chat with AI about the current page's content
- **🔘 Floating Bubble** — Appears on text selection for quick access
- **⚙️ Radial Menu** — Long-press for more tools (translate page, summarize, ask)
- **📜 Chat History** — All interactions saved per tab and URL
- **🎨 Beautiful Dark UI** — Terminal-inspired design, matches OpenClaw's aesthetic

## Architecture

```
Chrome Page
  ├─ Floating bubble (content script) → inline popup with result
  └─ Side panel (extension icon) → full-featured standalone panel
       ↓ HTTP (chrome-extension → 127.0.0.1:{port})
       Local LLM/Agent Gateway → LLM
```

## Prerequisites

ClawSide connects to any local LLM/Agent that provides an OpenAI-compatible HTTP endpoint. Enable the HTTP Gateway in your configuration, then ClawSide will connect automatically.

## Quick Start

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** → **Load unpacked** → select the `extension/` folder
3. Select text on any page → floating bubble appears → click an icon
4. Or click the ClawSide extension icon → **Open side panel** for full features

## Keyboard Shortcut

`Ctrl+Shift+P` (Mac: `Command+Shift+P`) — Open or close the side panel

## License

MIT
