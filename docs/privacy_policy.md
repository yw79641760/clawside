---
title: Privacy Policy
layout: page
---

**Last Updated: 2026-04-21**

## Overview

ClawSide is a browser extension that provides AI-powered browsing assistance by communicating with your local OpenClaw Gateway. This privacy policy describes how ClawSide handles your data.

## Data Collection and Processing

### What Data ClawSide Accesses

ClawSide accesses the following data within your browser to provide its features:

| Permission | Data Accessed | Purpose |
|------------|---------------|---------|
| `sidePanel` | Extension UI state | Display the side panel interface |
| `storage` | Extension settings, chat history | Store user preferences and conversation history locally |
| `activeTab`, `tabs` | Current tab URL and title | Provide AI context about the page you are viewing |
| `scripting` | Page content (visible text only) | Extract content for summarization and analysis |
| `webNavigation` | Tab URL changes | Refresh AI context when you navigate to a new page |

### How Data Is Used

- **Page Context (URL, Title)**: Used to provide relevant AI responses based on the page you are currently viewing
- **Page Content**: Used exclusively for the "Summarize" and "Ask" features. Content is sent to your local OpenClaw Gateway (`127.0.0.1:18789`) for processing
- **Chat History**: Stored locally in Chrome's extension storage, associated with the specific URL you were viewing

### What Data Is NOT Collected

ClawSide does **not** transmit any of the following to external servers:

- No browsing history
- No cookies or session data
- No passwords or credentials
- No form data
- No personal identifiable information (PII)
- No data beyond what is necessary for the current AI request

## Data Storage and Retention

### Local Storage

All data processed by ClawSide is stored **locally on your device**:

- **Settings**: Stored in Chrome's extension local storage. You can clear this at any time via Chrome's extension management
- **Chat History**: Stored locally per-tab and per-URL. You can delete individual conversations or clear all history via the History tab in the extension
- **Summarize Results**: Cached locally for performance. Not transmitted to any remote server

### Data Retention

- Chat history is retained until you delete it
- Settings are retained until you change or reset them
- You can uninstall the extension at any time to remove all locally stored data

## Data Sharing

### No Third-Party Sharing

ClawSide does **not** share, sell, rent, or transmit any user data to:

- Third-party servers
- Analytics services
- Advertising networks
- Any external parties

### Communication with OpenClaw Gateway

ClawSide communicates exclusively with your local OpenClaw Gateway via `localhost` (`127.0.0.1:18789`):

- All AI requests are processed by your local OpenClaw installation
- No data leaves your machine through this channel
- The OpenClaw Gateway may have its own privacy policy; please refer to [OpenClaw's documentation](https://docs.openclaw.ai) for details about that service

## Security

- All communication between ClawSide and OpenClaw Gateway occurs over localhost only
- No data is transmitted over the network to external servers
- Extension permissions are limited to the minimum necessary for functionality

## User Rights

You have the following rights regarding your data:

- **Access**: You can view all stored chat history via the History tab
- **Delete**: You can delete individual conversations or clear all history
- **Uninstall**: Uninstalling the extension removes all locally stored data

## Changes to This Policy

If this privacy policy is updated, the "Last Updated" date at the top of this page will be revised.

## Contact

If you have questions or concerns about this privacy policy, please contact the project maintainer through the GitHub repository.
