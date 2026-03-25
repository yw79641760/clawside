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

#### 4.1 Context Menu (Primary UX)
- **Trigger**: User selects text on any page → right-click → ClawSide menu
- **Menu items**:
  - 🌐 翻译 — translate to target language
  - 📄 总结 — summarize the page
  - 💬 提问 — ask a question about selected text or page
- **Flow**: Click → side panel opens → action auto-triggers → result displayed
- **Memory**: All interactions stored

#### 4.2 Text Translation
- **Trigger**: Click "Translate" button OR context menu → 翻译
- **Flow**: Selected text → `/v1/chat/completions` → translated text → side panel
- **Output**: Translated text in card with "Copy" button
- **Memory**: `{ type: "translate", original, result, lang, url, timestamp }`

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
| Context menu | native browser | auto open side panel | — |

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

### Settings Panel
- OpenClaw URL: `http://127.0.0.1:18789` (default, editable)
- Bridge Server Port: `18792` (default, editable)
- Target Language: dropdown (English, Chinese, Japanese, etc.)

---

## 6. Technical Approach

### Chrome Extension (Manifest V3)
- `sidepanel.js` — main UI logic
- `content.js` — captures text selection, sends to side panel via `chrome.runtime.sendMessage`
- `background.js` — service worker, handles message routing
- `manifest.json` — extension config

### Bridge Server (`server/bridge.js`)
- Node.js HTTP server on port 18792
- WebSocket client connects to OpenClaw Gateway (ws://127.0.0.1:18789)
- Translates HTTP requests from extension → WebSocket frames to Gateway
- Returns LLM responses as HTTP JSON responses
- Auth: passes through Bearer token from config

### API Design

**Extension → Bridge Server**

```
POST /translate
Body: { text: string, targetLang: string }
Response: { result: string }

POST /summarize
Body: { url: string }
Response: { summary: string }

GET /history
Response: { items: MemoryItem[] }

DELETE /history
Response: { ok: true }
```

**Bridge → OpenClaw Gateway (WebSocket)**

For translate:
```json
{
  "type": "req",
  "id": "req-1",
  "method": "tools.invoke",
  "params": {
    "name": "llm",
    "input": {
      "prompt": "Translate to Chinese: {text}",
      "model": "auto"
    }
  }
}
```

### Memory Storage
- `chrome.storage.local` — key `clawside_memory`
- Schema:
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "translate" | "summarize",
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
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── sidepanel.html
│   ├── sidepanel.css
│   ├── sidepanel.js
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── server/
    ├── package.json
    └── bridge.js
```

---

## 7. MVP Out of Scope

- Multiple target languages (UI selects but LLM prompt hardcoded to Chinese for now)
- Persistent server (bridge should auto-start, but no launchd/systemd config yet)
- Authentication flow (OpenClaw token stored in chrome.storage.local, insecure for MVP)
- Streaming responses
- Error retry logic
