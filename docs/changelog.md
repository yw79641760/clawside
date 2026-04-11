---
title: Changelog
layout: page
---

All notable changes to ClawSide will be documented in this file.

## [1.0.0] - 2026-04-09

### Added
- Chrome side panel extension with Translate/Summarize/Ask/History tabs
- Floating bubble on text selection with quick actions
- Radial menu (long-press on bubble) for tool selection
- Global page translation via radial menu
- Chat history per tab+URL with LRU cache (max 50 conversations)
- History deduplication to prevent duplicate entries
- Ask from Summarize: jump to Ask tab with summarize result as context
- Auto-trigger summarize when opening side panel via summarize action
- Popup Ask transfer: continue conversation in side panel
- Settings: gateway port, auth token, language, tool prompts, appearance (system/light/dark)
- Test Connection button in settings
- Streaming responses for all tools
- Dark/Light theme support matching system preference

### Fixed
- Popup streaming using chrome.runtime.onMessage instead of chrome.tabs.onMessage
- selectedText retrieval from UI element and dataset.fullText
- Chat session using hasPreviousAsk() to determine page content inclusion
- Various styling fixes (Discord color, chat input height)

### Changed
- Session format: `clawside:{toolName}` (instead of `openai-user:clawside:{toolName}`)
- Page content truncated to 12k characters for Ask context

## [0.1.0] - 2026-03-25 - Initial alpha release

### Added
- Basic floating bubble with translate/summarize/ask actions
- Side panel with Translate/Summarize/Ask tabs
- OpenClaw gateway integration via HTTP
