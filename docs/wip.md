---
title: TypeScript Migration WIP
layout: page
---

# TypeScript Migration WIP

> Project: ClawSide Extension
> Started: 2026-04-28
> Status: In Progress

## Overview

Migrate the entire ClawSide Chrome Extension from JavaScript to TypeScript for better type safety, code quality, and developer experience.

## Code Statistics

- **21 JS files**
- **~7,446 lines of code**
- **3 modules** (Components, Shared, Tools)

## Migration Plan

### Phase 1: Tool Utilities (Easy - Low Dependencies)

| Priority | File | Lines | Status | Notes |
|----------|------|-------|--------|-------|
| 1 | src/tools/text.ts | 9 | ✅ Done | |
| 2 | src/tools/url-utils.ts | 39 | ✅ Done | |
| 3 | src/tools/browser.ts | 30 | ✅ Done | |
| 4 | src/tools/icons.ts | 47 | ✅ Done | |

### Phase 2: Core Utilities (Medium - Some Dependencies)

| Priority | File | Lines | Status | Notes |
|----------|------|-------|--------|-------|
| 5 | src/tools/lru-cache.js | 173 | Pending | Base class |
| 6 | src/tools/chat-lru-cache.js | 165 | Pending | Extends lru-cache |
| 7 | src/tools/context-lru-cache.js | 198 | Pending | |
| 8 | src/tools/lang-utils.js | 170 | Pending | |
| 9 | src/tools/streaming-result.js | 50 | Pending | |

### Phase 3: External APIs (Medium)

| Priority | File | Lines | Status | Notes |
|----------|------|-------|--------|-------|
| 10 | src/tools/openai-compatible.js | 130 | Pending | API client |

### Phase 4: Shared Modules (Medium - Complex)

| Priority | File | Lines | Status | Notes |
|----------|------|-------|--------|-------|
| 11 | src/shared/settings.js | 167 | Pending | User preferences |
| 12 | src/shared/panel-context.js | 349 | Pending | |
| 13 | src/shared/tab-context-manager.js | 462 | Pending | Complex state |
| 14 | src/shared/chat-session.js | 349 | Pending | |

### Phase 5: Complex Tools (High)

| Priority | File | Lines | Status | Notes |
|----------|------|-------|--------|-------|
| 15 | src/tools/appearance.js | 601 | Pending | CSS injection |
| 16 | src/tools/page.js | 345 | Pending | DOM manipulation |

### Phase 6: Components (High - Complex)

| Priority | File | Lines | Status | Notes |
|----------|------|-------|--------|-------|
| 17 | src/components/dock.js | 540 | Pending | Radial menu |
| 18 | src/components/popup.js | 986 | Pending | Floating bubble |
| 19 | src/components/sidepanel.js | 2351 | Pending | Main panel |

### Phase 7: Entry Points

| Priority | File | Lines | Status | Notes |
|----------|------|-------|--------|-------|
| 20 | content.js | 15 | Pending | Entry point |
| 21 | background.js | 270 | Pending | Service worker |

## Work Estimate

| Phase | Work | Estimated Hours |
|-------|------|----------------|
| Phase 1 | Tool Utilities | 1-2h |
| Phase 2 | Core Utilities | 2-3h |
| Phase 3 | External APIs | 1-2h |
| Phase 4 | Shared Modules | 3-4h |
| Phase 5 | Complex Tools | 2-3h |
| Phase 6 | Components | 4-6h |
| Phase 7 | Entry Points | 1-2h |
| **Total** | | **14-22h** |

## Setup Tasks

- [x] Install TypeScript and related packages
- [x] Configure tsconfig.json
- [x] Set up build pipeline (Vite)
- [x] Configure d.ts for Chrome APIs
- [ ] Set up CI/CD for TypeScript build

## Completed Tasks

- [x] Initial setup - TypeScript environment ready
- [x] Phase 1 planning complete
- [x] Phase 1 complete - Tool Utilities (text, url-utils, browser, icons)