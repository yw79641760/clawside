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
Chrome Extension
  ├─ Content Script (floating bubble + radial menu)
  ├─ Side Panel (full UI)
  └─ Service Worker (background.js)
       ↓ HTTP POST (chrome.runtime.sendMessage)
       ↓ HTTP POST (fetch → 127.0.0.1:18789)
OpenClaw Gateway (/v1/chat/completions)
       ↓
LLM (configured provider)
```

**No bridge server needed** — Chrome extensions can access localhost directly with `host_permissions` declared in manifest.

---

## 4. Features & Interactions

### 4.1 Three Interaction Modes

#### Floating Bubble (Primary)
- **Trigger**: User selects text on any page → floating bubble appears after ~250ms
- **Bubble buttons**: 🌐 translate, 📄 summarize, 💬 ask
- **Flow**: Click button → small popup appears inline → result shown directly
- **Popup**: 320px wide, max 280px tall, scrollable, with copy button
- **Auto-hide**: Bubble + popup disappear on click outside or Escape

#### Radial Menu
- **Trigger**: Long press / right-click on floating bubble → radial menu appears
- **Menu items**: translate, summarize, ask (arranged radially)
- **Flow**: Click item → opens side panel to corresponding tab → auto-triggers action

#### Full Side Panel
- **Trigger**: Click extension icon or Ctrl+Shift+P
- **Tabs**: Translate, Summarize, Ask, History, Settings
- **Features**: Full chat interface, context management, tool prompts

### 4.2 Translation

- **Trigger**: Bubble button / Side panel Translate tab / Radial menu
- **Side panel flow**: Select target language → click Translate → result in card
- **Output**: Translated text with copy button
- **History**: Stored in `clawside_chat_{tabId}_{urlHash}`

### 4.3 Page Summarization

- **Trigger**: Bubble button / Side panel Summarize tab / Radial menu
- **Flow**: Page URL + content → `/v1/chat/completions` → 3-5 sentence summary
- **Auto-trigger**: When opening via summarize action with no existing result, automatically triggers
- **Output**: Summary in card with copy button and ask icon (jump to Ask with context)
- **Storage**: `clawside_summarize_{tabId}_{urlHash}`

### 4.4 Ask / Chat Interface

- **Trigger**: Bubble button / Side panel Ask tab / Radial menu
- **Flow**: User question + page context → LLM → answer
- **Context**: Current page URL, title, content, selected text
- **History**: Per-tab+URL conversation, max 50 sessions with LRU eviction
- **Features**: Markdown rendering, streaming responses, Ctrl+Enter to send

### 4.5 Ask from Summarize

- **Trigger**: Click ask icon in summarize result header
- **Flow**: Jump to Ask tab → load summarize result as conversation context → auto-scroll to input
- **Context format**: User message + assistant message with summary content

### 4.6 Interaction History

- **Trigger**: Click "History" tab in side panel
- **Output**: Chronological list of all translate/summarize/ask interactions, expandable items
- **Deduplication**: Uses key-based system to prevent duplicate entries
  - Ask: `cs_history_ask_{tabId}_{urlHash}`
  - Translate: `cs_history_translate_{textHash}`
  - Summarize: `cs_history_summarize_{tabId}_{urlHash}`

### 4.7 Settings

- **Trigger**: Click gear icon in action bar
- **Options**: Gateway port, auth token, language preference, tool prompt customization

---

## 5. Component Inventory

### Side Panel Layout
```
┌─────────────────────────────────┐
│  [🌐] [📄] [💬]       [⚙️] [📜] │  ← action bar (sticky)
├─────────────────────────────────┤
│  [Context: page info + refresh] │  ← page context
├─────────────────────────────────┤
│                                 │
│  (content area)                 │
│  - Result card                 │
│  - Chat messages               │
│  - Input area                  │
│                                 │
└─────────────────────────────────┘
```

### Result Card (Translate/Summarize)
```
┌─────────────────────────────────┐
│ 📝 Translate      [📋] [💬]     │  ← copy + ask icons
├─────────────────────────────────┤
│                                 │
│  Result text goes here...       │
│                                 │
└─────────────────────────────────┘
```

### Chat Interface (Ask)
```
┌─────────────────────────────────┐
│ 👤 User message                 │
│ 🤖 AI response (streaming)      │
├─────────────────────────────────┤
│ [Input...              ] [Send] │
└─────────────────────────────────┘
```

---

## 6. Technical Approach

### Chrome Extension (Manifest V3)

**Key Components**:
- `extension/src/components/sidepanel.js` — Main UI, tabs, chat, auto-trigger
- `extension/src/components/popup.js` — Floating bubble, action dispatch
- `extension/src/components/dock.js` — Radial menu
- `extension/src/shared/chat-session.js` — Per-tab+URL chat management
- `extension/src/shared/panel-context.js` — Page context management
- `extension/src/shared/tab-context-manager.js` — Tab context with LRU cache
- `extension/background.js` — Service worker, message routing
- `extension/src/tools/icons.js` — SVG icon system with injectSprite

### Storage Keys

| Key Pattern | Purpose |
|-------------|---------|
| `clawside_settings` | User settings (port, token, language, prompts) |
| `clawside_chat_{tabId}_{urlHash}` | Chat history per tab+URL (max 50) |
| `clawside_summarize_{tabId}_{urlHash}` | Summarize results per tab+URL |
| `_pendingTab`, `_pendingAction` | Panel-open flow (temporary) |

### LRU Cache

- **ChatLRUCache**: maxMapSize 50 (tabs), maxLruSize 10 (sessions per tab)
- **ContextLRUCache**: maxMapSize 50 (tabs), maxLruSize 10 (contexts)

### API Design

**Extension → OpenClaw Gateway HTTP**
```
POST /v1/chat/completions
Headers: Authorization: Bearer <token>
Body: { model: "openclaw/main", messages: [{role:"user", content: "<prompt>"}] }
Response: streaming { choices: [{delta: {content: "..."}}] }
```

### Floating Bubble
- Created by content script on text selection (250ms debounce)
- Positioned via `getBoundingClientRect()` + viewport clamping
- Auto-hides on click outside or selection cleared
- z-index: 2147483647 (max safe integer)

### SVG Icons
- Icons stored in `extension/assets/icons/icons.svg` as symbols
- Loaded via `injectSprite()` in sidepanel init
- Usage: `<svg><use href="#cs-icon-name"></use></svg>`

---

## 7. MVP Out of Scope (Completed)

- ✅ Streaming responses
- ✅ Per-tab+URL chat history
- ✅ Tool prompt customization
- ✅ Auto-trigger summarize
- ✅ Ask from Summarize
- ✅ Radial menu
