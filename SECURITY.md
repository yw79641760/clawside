# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | ✅ Currently supported |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

### Do NOT

- ❌ Do NOT open a public GitHub issue for security vulnerabilities
- ❌ Do NOT share vulnerability details in Discord or other public channels

### DO

- ✅ Email: `me@yanwei.xyz`
- ✅ [Private vulnerability report on GitHub](https://github.com/yw79641760/clawside/security/advisories/new)

Please include as much detail as possible:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Resolution**: As soon as possible, depending on complexity

## Security Model

ClawSide is designed with privacy as a core principle:

- **Local processing**: All AI interactions go through your local gateway
- **No data exfiltration**: ClawSide does not send your browsing data to third-party servers
- **Minimal permissions**: Only requests permissions necessary for functionality
- **Open source**: The entire codebase is open for security review

## Permissions Used

- `sidePanel` — To show the side panel UI
- `storage` — To save settings and chat history locally
- `activeTab` — To access current tab content when you request it
- `scripting` — To inject content scripts for page translation
- `tabs` — To manage extension tab interactions
- `webNavigation` — To track page navigation
- `downloads` — To download chat history
- `host_permissions: http://127.0.0.1:18789/*` — To communicate with your local AI gateway only

## Update Policy

Always use the latest version. Security fixes are released incrementally through our update cycle.
