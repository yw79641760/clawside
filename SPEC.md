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
       ↓ HTTP POST (localhost:18792)
ClawSide Bridge Server (Node.js)
       ↓ WebSocket (localhost:18789)
OpenClaw Gateway
       ↓
LLM (GLM-5 / configured provider)
```

**Why a bridge server?**
OpenClaw Gateway uses a WebSocket-based protocol with challenge-response auth. Chrome service workers can't speak this protocol directly. The bridge server is a thin (~100 LOC) WebSocket<→HTTP proxy purpose-built for ClawSide.

**Port**: `18792` (derived from OpenClaw port 18789 + 3)

---

## 4. Features & Interactions

### MVP (this version)

#### 4.1 Text Translation
- **Trigger**: User selects text on any page → clicks "Translate" button in side panel (or uses keyboard shortcut)
- **Flow**: Selected text → bridge server → OpenClaw LLM → translated text → side panel
- **Output**: Translated text displayed in a card, with "Copy" button
- **Memory**: Interaction stored: `{ type: "translate", original, result, url, timestamp }`

#### 4.2 Page Summarization
- **Trigger**: User clicks "Summarize Page" button in side panel
- **Flow**: Page URL/content → bridge server → OpenClaw (web_fetch tool) → summary → side panel
- **Output**: 3-5 sentence summary in a card
- **Memory**: Interaction stored: `{ type: "summarize", url, summary, timestamp }`

#### 4.3 Interaction History
- **Trigger**: User clicks "History" tab in side panel
- **Flow**: Read from chrome.storage.local
- **Output**: Chronological list of past translate/summarize interactions, most recent first
- **Limit**: Last 50 interactions

#### 4.4 Clear Memory
- **Trigger**: "Clear History" button in History tab
- **Flow**: Clear chrome.storage.local
- **Output**: Empty state with message

### Interactions Detail

| Element | Hover | Click | Loading State |
|---------|-------|-------|---------------|
| Translate button | bg lighten | → spinner, disable | "Translating..." |
| Copy button | scale 1.05 | → "Copied!" 1.5s | — |
| History item | border highlight | expand to show full text | — |
| Summarize button | bg lighten | → spinner | "Summarizing..." |

### Error Handling
- Network error → show "Cannot reach OpenClaw. Is the bridge server running?"
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
