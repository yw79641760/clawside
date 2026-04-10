# ClawSide Privacy Policy

## Data Collection

ClawSide does **not** collect, store, or transmit any personal user data to external servers.

## Local-Only Operation

ClawSide operates exclusively with your local OpenClaw Gateway:

- All data stays on your local machine
- Communication is limited to `127.0.0.1:18789` (localhost only)
- No data is sent to any remote server

## No Tracking

- No analytics or usage tracking
- No browsing history collection
- No cookies or persistent identifiers
- No third-party integrations

## What ClawSide Accesses

| Permission | Purpose |
|------------|---------|
| `sidePanel` | Display the side panel UI |
| `storage` | Store settings and conversation history locally |
| `activeTab`, `tabs` | Read page context (URL, title) for AI features |
| `scripting` | Extract page content for summarization |
| `webNavigation` | Track tab URL changes for context refresh |

## User Data Storage

- **Settings**: Stored in Chrome's local storage, never leaves your device
- **Chat History**: Stored locally per-tab+URL, you can clear it anytime via the History tab
- **Summarize Results**: Cached locally, not transmitted anywhere

## Contact

For privacy concerns, please refer to OpenClaw's documentation or contact the project maintainer.
