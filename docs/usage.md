---
title: Usage
layout: page
---

## Floating Bubble

The floating bubble is the quickest way to use ClawSide. Select any text on a webpage, and after ~250ms a small bubble appears above your selection.

**Bubble buttons:**
- 🌐 **Translate** — Translate selected text
- 📄 **Summarize** — Summarize the current page
- 💬 **Ask** — Ask a question about the content

Click any button to get results directly in a popup. Use the **copy button** to copy results.

### Positioning

The bubble appears at the horizontal center of your selection, positioned below the text. If there's not enough space below, it flips above instead.

---

## Side Panel

For the full experience, open the side panel by clicking the ClawSide extension icon in your browser toolbar, or press:

- **Windows/Linux**: `Ctrl+Shift+P`
- **Mac**: `Command+Shift+P`

The side panel contains all four tools: **Translate**, **Summarize**, **Ask**, and **History**.

---

## Translate

### Quick Translate (Floating Bubble)

1. Select text on any page
2. Click the 🌐 button on the floating bubble
3. Translation appears in the popup
4. Click 📋 to copy

### Side Panel Translate

1. Open the side panel
2. Select text on the page (or it auto-detects)
3. Choose target language from dropdown
4. Click Translate

### Global Page Translation

1. Long-press or right-click the floating bubble
2. Select **Translate** from the radial menu
3. All paragraphs on the page are translated
   - Translated in batches of 10 paragraphs
   - Shows loading placeholders during translation
   - Click again to hide/show translations

---

## Summarize

### Quick Summarize (Floating Bubble)

1. With text selected, click 📄 on the bubble
2. Page summary appears in the popup

### Side Panel Summarize

1. Open the side panel → **Summarize** tab
2. Page content is automatically loaded
3. Summary appears with copy and ask buttons

### Ask from Summary

From a summarize result, click the 💬 icon to:
- Jump to the **Ask** tab
- Load the summary as conversation context
- Continue asking questions about the page

---

## Ask

The Ask tool lets you chat with AI about the current page's content.

### How to Use

1. Open the side panel → **Ask** tab
2. Type your question about the page
3. Press `Enter` or click **Send**
4. AI response streams in
5. Conversation continues in context

### Tips

- **Context**: Your current page URL, title, and content are automatically included
- **Selected text**: If you select text before asking, that text is prioritized
- **Keyboard shortcut**: `Ctrl+Enter` to send quickly
- **Markdown**: Responses render with Markdown formatting

### Transfer from Popup

Had a conversation in the floating bubble popup? Click the **open-external** icon (top-right) to transfer the chat history to the side panel's Ask tab and continue there.

---

## History

All your interactions are saved per tab and URL.

### Viewing History

1. Open the side panel → **History** tab
2. See a chronological list of all translate/summarize/ask interactions
3. Click any item to expand and see details

### Storage

- Chat history is stored locally in your browser (Chrome storage API)
- Maximum 50 conversation sessions per tab with LRU eviction
- History is keyed by tab ID + page URL hash

---

## Settings

Click the ⚙️ gear icon in the side panel action bar to access settings.

### Basic Settings

- **Gateway Port**: Default `18789` (OpenClaw default)
- **Auth Token**: If your gateway requires authentication
- **Language**: Preferred language for translations
- **Appearance**: System / Light / Dark theme
- **Test Connection**: Verify gateway connectivity

### Tool Prompts

Customize the prompts used for each tool:
- **{lang}** — Target language placeholder
- **{text}** — Selected text placeholder
- **{content}** — Page content placeholder

### About

- Extension version
- Debug information
- Links to changelog, license, support
