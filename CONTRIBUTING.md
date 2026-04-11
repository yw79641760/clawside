# Contributing to ClawSide

Thank you for your interest in contributing to ClawSide!

## How to Contribute

### Reporting Bugs

If you find a bug, please open an [issue on GitHub](https://github.com/yw79641760/clawside/issues) with:
- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Chrome version, gateway version)

### Suggesting Features

We welcome feature requests! Open an [issue](https://github.com/yw79641760/clawside/issues) with the label "enhancement" and describe:
- The problem you're trying to solve
- How you envision the solution
- Any alternatives you've considered

### Pull Requests

1. **Fork the repository** and create your branch from `master`.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/clawside.git
   cd clawside
   ```
3. **Load the extension** in Chrome:
   - Open `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** → select the `extension/` folder
4. **Make your changes** — the extension auto-reloads when you click the refresh icon on the card.
5. **Test thoroughly** — try all related functionality.
6. **Commit** with clear messages:
   ```bash
   git commit -m "fix: resolve streaming timeout issue"
   ```
7. **Push and create a PR**:
   ```bash
   git push origin my-branch
   ```
8. Open a Pull Request against `master`.

### Development Setup

```bash
# Install dependencies (if needed for testing)
npm install

# Run tests
npm test
```

### Code Style

- JavaScript: Follow existing patterns in the codebase
- CSS: Use existing variables and naming conventions
- Markdown: Use ATX-style headers (`#`, `##`, etc.)

## Project Structure

```
clawside/
├── extension/           # Chrome extension source
│   ├── manifest.json    # Extension manifest (MV3)
│   ├── background.js    # Service worker
│   ├── content.js       # Content script entry
│   ├── src/
│   │   ├── components/  # UI components (popup, sidepanel, dock)
│   │   ├── shared/      # Shared utilities (settings, chat-session)
│   │   └── tools/       # Tools (openai-compatible, page, browser)
│   └── styles/          # CSS styles
├── docs/                # Documentation site (Jekyll)
└── tests/              # Test files
```

## Questions?

Feel free to reach out via:
- [GitHub Issues](https://github.com/yw79641760/clawside/issues)
- [Discord Community](https://discord.gg/PSEpX9dD)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
