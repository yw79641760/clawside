# ClawSide — SPEC.md

## 1. Concept & Vision

**ClawSide** is a Chrome side panel extension that acts as a bridge between your browser and local OpenClaw instance. When you select text or want to summarize a page, instead of copy-pasting to ChatGPT/Monica/sider, you just use the side panel — and OpenClaw handles it, remembers it, and can build on it later.

The feeling: **OpenClaw is always there, inside your browser, watching your back without being creepy.**

MVP focus: lightweight, fast, works offline except for LLM calls.

---

## 2. Design Language

**Aesthetic**: Dark terminal-inspired, but refined. Think VS Code meets Arc browser.

**Colors**:
- Background: `#0d1117` (deep dark)
- Surface: `#161b22` (card/panel bg)
- Border: `#30363d`
- Primary: `#58a6ff` (link blue)
- Accent: `#f78166` (warm orange, matches OpenClaw's orange)
- Text primary: `#e6edf3`
- Text muted: `#8b949e`
- Success: `#3fb950`
- Error: `#f85149`

**Typography**:
- UI: `Inter`, system-ui fallback
- Code/mono: `JetBrains Mono`, monospace

**Spatial system**:
- Base unit: 4px
- Card padding: 16px
- Gap between sections: 12px

**Motion**:
- Micro: 150ms ease-out for hovers/toggles
- Panel transitions: 200ms ease

---

## 3. Architecture

```
Chrome Side Panel (UI)
       ↓ HTTP POST (chrome-extension → 127.0.0.1:18789)
OpenClaw Gateway (direct /v1/chat/completions)
       ↓
LLM (configured provider: GLM-5 via Minimax)
```

**No bridge server needed** — Chrome extensions can access localhost directly with `host_permissions` declared in manifest.

---

## 4. Features & Interactions

### MVP (this version)

#### 4.1 Inline Popup (Primary UX)
- **Trigger**: User selects text on any page → floating bubble appears after ~250ms
- **Bubble buttons**:
  - 🌐 translate
  - 📄 summarize
  - 💬 ask
- **Flow**: Click button → small popup appears inline near selection → result shown directly
- **Popup**: 320px wide, max 280px tall, scrollable, with Copy button
- **Auto-hide**: Bubble + popup disappear on click outside or Escape
- **Position**: Below selection, clamped to viewport. If near bottom, shows above.
- **Memory**: All interactions stored

#### 4.2 Text Translation (Side Panel)
- **Trigger**: Click extension icon → open full side panel → Translate tab
- **Flow**: Side panel → Translate tab → select target language → click Translate
- **Output**: Translated text in card with "Copy" button

#### 4.3 Page Summarization
- **Trigger**: Click "Summarize" button OR context menu → 总结
- **Flow**: Page URL → `/v1/chat/completions` → 3-5 sentence summary → side panel
- **Output**: Summary in card with "Copy" button
- **Memory**: `{ type: "summarize", url, title, summary, timestamp }`

#### 4.4 Ask
- **Trigger**: Click "Ask" tab OR context menu → 提问
- **Flow**: Selected text + question → `/v1/chat/completions` → answer → side panel
- **Context**: If no text selected, uses current page URL as context
- **Output**: Answer in card with "Copy" button
- **Memory**: `{ type: "ask", question, answer, context, url, timestamp }`

#### 4.5 Interaction History
- **Trigger**: Click "History" tab
- **Flow**: Read from `chrome.storage.local`
- **Output**: Chronological list, expandable items, last 50 interactions

#### 4.6 Clear Memory
- **Trigger**: "Clear All" button in History tab
- **Output**: Empty state

### Interactions Detail

| Element | Hover | Click | Loading State |
|---------|-------|-------|---------------|
| Translate button | bg lighten | → spinner, auto-scroll | "Translating..." |
| Summarize button | bg lighten | → spinner | "Summarizing..." |
| Ask button | bg lighten | → spinner | "Thinking..." |
| Copy button | scale 1.05 | → "Copied!" 1.5s | — |
| History item | border highlight | expand/collapse | — |
| Floating bubble | fade + scale in | open side panel, auto-trigger action | — |

### Error Handling
- Network error → "Failed to fetch" — check gateway is running
- 401 → Gateway auth required — enter token in settings
- Empty selection for Ask → uses page context only
- LLM error → show error message from OpenClaw
- Empty selection → "Please select some text first"

---

## 5. Component Inventory

### Side Panel Layout
```
┌─────────────────────────────────┐
│  🔗 ClawSide           [⚙️]     │  ← header
├─────────────────────────────────┤
│  [Translate]  [Summarize]       │  ← tab/action bar
├─────────────────────────────────┤
│                                 │
│  (content area)                 │
│                                 │
│  - Result card (after action)  │
│  - History list (history tab)  │
│                                 │
└─────────────────────────────────┘
```

### Result Card
```
┌─────────────────────────────────┐
│ 📝 Translate          [📋 Copy]│
├─────────────────────────────────┤
│                                 │
│  Translated text goes here...   │
│                                 │
└─────────────────────────────────┘
```

### History Item (collapsed)
```
┌─────────────────────────────────┐
│ 🔤 Translate · 12:34 PM  today  │
│ "original text snippet..."      │
└─────────────────────────────────┘
```

### History Item (expanded)
```
┌─────────────────────────────────┐
│ 🔤 Translate · 12:34 PM  today  │
│ Original: "hello world"         │
│ Result:   "你好世界"            │
│ Source: example.com             │
└─────────────────────────────────┘
```

---

## 6. Technical Approach

### Chrome Extension (Manifest V3)
- `sidepanel.js` — main UI logic, tab management, history
- `content.js` — floating bubble UI, selection detection, positioning
- `background.js` — service worker, message routing
- `manifest.json` — extension config

### Direct Gateway Integration
- Extension calls `http://127.0.0.1:18789/v1/chat/completions` directly
- No bridge server or separate process needed
- Chrome `host_permissions` allows localhost access

### API Design

**Extension → OpenClaw Gateway HTTP**

```
POST /v1/chat/completions
Headers: Authorization: Bearer <token>
Body: { model: "main", messages: [{role:"user", content: "<prompt>"}] }
Response: { choices: [{message: {content: "..."}}] }
```

### Floating Bubble
- Created by content script on text selection (300ms debounce)
- Positioned via `getBoundingClientRect()` + viewport clamping
- Auto-hides on click outside or selection cleared
- z-index: 2147483647 (max safe integer)

### Memory Storage
- `chrome.storage.local` — key `clawside_memory`
- Schema:
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "translate" | "summarize" | "ask",
      "original": "...",
      "result": "...",
      "url": "https://...",
      "timestamp": 1742000000000
    }
  ]
}
```

### File Structure
```
clawside/
├── SPEC.md
├── README.md
└── extension/
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── sidepanel.html
    ├── sidepanel.css
    ├── sidepanel.js
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

---

## 7. MVP Out of Scope

- Streaming responses
- Error retry logic
- Multi-language prompt templates
- Custom prompt input for Ask tab
