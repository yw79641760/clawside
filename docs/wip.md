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

## Migration Progress

| Module | Files | Lines | Status | Notes |
|--------|-------|-------|--------|-------|
| **Tools** | | | Pending | |
| └ text.js | 1 | 9 | Pending | |
| └ browser.js | 1 | 30 | Pending | |
| └ url-utils.js | 1 | 39 | Pending | |
| └ icons.js | 1 | 47 | Pending | |
| └ streaming-result.js | 1 | 50 | Pending | |
| └ openai-compatible.js | 1 | 130 | Pending | |
| └ chat-lru-cache.js | 1 | 165 | Pending | |
| └ lang-utils.js | 1 | 170 | Pending | |
| └ lru-cache.js | 1 | 173 | Pending | |
| └ context-lru-cache.js | 1 | 198 | Pending | |
| └ appearance.js | 1 | 345 | Pending | |
| └ page.js | 1 | 601 | Pending | |
| **Shared** | | | Pending | |
| └ settings.js | 1 | 167 | Pending | |
| └ chat-session.js | 1 | 349 | Pending | |
| └ panel-context.js | 1 | 349 | Pending | |
| └ tab-context-manager.js | 1 | 462 | Pending | |
| **Components** | | | Pending | |
| └ dock.js | 1 | 540 | Pending | |
| └ popup.js | 1 | 986 | Pending | |
| └ sidepanel.js | 1 | 2351 | Pending | |
| **Core** | | | Pending | |
| └ background.js | 1 | 270 | Pending | |
| └ content.js | 1 | 15 | Pending | |

## Work Estimate

| Phase | Work | Estimated Hours |
|-------|------|----------------|
| 1. Setup | tsconfig, types, build chain | 2-4h |
| 2. Tools | Utility modules | 4-8h |
| 3. Shared | Core modules | 4-6h |
| 4. Components | UI components | 4-6h |
| 5. Core | Background/content | 1-2h |
| 6. Testing & Fixes | Debug & type errors | 4-8h |
| **Total** | | **19-34h** |

## Setup Tasks

- [x] Install TypeScript and related packages
- [x] Configure tsconfig.json
- [x] Set up build pipeline (Vite)
- [x] Configure d.ts for Chrome APIs
- [ ] Set up CI/CD for TypeScript build

## Completed Tasks

- [x] Initial setup - TypeScript environment ready

## Notes

- Use `allowJs: true` for gradual migration
- Generate declaration files for Chrome APIs
- Maintain compatible output for Chrome Extension manifest v3