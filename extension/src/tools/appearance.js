// ClawSide - Styles & Theme
// Handles theme variable injection and the shared content-script CSS bundle.
// Used by content.js only (the side panel uses sidepanel.css loaded via <link>).

/** Theme CSS variable sets for the floating-ball / popup / radial-menu UI. */
const THEMES = {
  dark: {
    '--cs-bg': '#161b22',
    '--cs-border': '#30363d',
    '--cs-text': '#e6edf3',
    '--cs-muted': '#8b949e',
    '--cs-primary': '#58a6ff',
    '--cs-success': '#3fb950',
    '--cs-error': '#f85149',
    '--cs-btn-hover': '#262c34',
    '--cs-btn-active': '#32393f',
    '--cs-header-bg': 'rgba(255,255,255,0.02)',
    '--cs-scrollbar': '#30363d',
  },
  light: {
    '--cs-bg': '#ffffff',
    '--cs-border': '#d0d7de',
    '--cs-text': '#1f2328',
    '--cs-muted': '#656d76',
    '--cs-primary': '#0969da',
    '--cs-success': '#1a7f37',
    '--cs-error': '#cf222e',
    '--cs-btn-hover': '#eaeef2',
    '--cs-btn-active': '#d0d7de',
    '--cs-header-bg': 'rgba(0,0,0,0.02)',
    '--cs-scrollbar': '#d0d7de',
  },
};

/** Page theme CSS variable sets for translation text (adapts to page's light/dark mode). */
const PAGE_THEMES = {
  dark: {
    '--cs-text': '#e6edf3',
  },
  light: {
    '--cs-text': '#1f2328',
  },
};

/** Determine effective appearance from setting + system preference. */
function resolveAppearance(appearanceSetting = 'system') {
  if (appearanceSetting === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return appearanceSetting;
}

/** Detect the current page's theme based on computed styles. */
function detectPageTheme() {
  // Helper: calculate brightness from RGB
  function calcBrightness(r, g, b) {
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  // Helper: get brightness from an element
  function getElementBrightness(el) {
    if (!el) return null;
    try {
      const bg = getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return null;
      const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        return calcBrightness(r, g, b);
      }
    } catch (e) {}
    return null;
  }

  // Helper: detect theme from CSS class names on html/body
  function detectFromClassName() {
    const elements = [document.documentElement, document.body];
    const darkPatterns = ['dark', 'dark-mode', 'dark-theme', 'theme-dark', 'night'];
    const lightPatterns = ['light', 'light-mode', 'light-theme', 'theme-light', 'day'];

    for (const el of elements) {
      if (!el) continue;
      const classList = el.className || '';
      const classStr = typeof classList === 'string' ? classList : classList.value || '';

      for (const pat of darkPatterns) {
        if (classStr.includes(pat)) {
          return 'dark';
        }
      }
      for (const pat of lightPatterns) {
        if (classStr.includes(pat)) {
          return 'light';
        }
      }
    }
    return null;
  }

  // Try body first
  let brightness = getElementBrightness(document.body);

  // If body is transparent, try html element
  if (brightness === null) {
    brightness = getElementBrightness(document.documentElement);
  }

  // If still transparent, check common page containers
  if (brightness === null) {
    const selectors = ['#app', '#root', 'main', 'article', '.content', '.main', '#content'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        brightness = getElementBrightness(el);
        if (brightness !== null) {
          break;
        }
      }
    }
  }

  // If we got a valid brightness, use it
  if (brightness !== null) {
    return brightness < 128 ? 'dark' : 'light';
  }

  // Try detecting from CSS class names
  const classResult = detectFromClassName();
  if (classResult) {
    return classResult;
  }

  // Fallback: check prefers-color-scheme
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Inject CSS custom-property theme variables into the page document root. */
function injectTheme(vars) {
  const existing = document.getElementById('cs-theme');
  if (existing) existing.remove();
  const s = document.createElement('style');
  s.id = 'cs-theme';
  let css = ':root {';
  for (const [k, v] of Object.entries(vars)) css += k + ':' + v + ';';
  css += '}';
  s.textContent = css;
  document.head.appendChild(s);
}

/** Content-script CSS bundle for popup (selection bubble + result popup), radial menu, and dock. */
const CONTENT_STYLES = `
  .cs-bubble {
    position: fixed; z-index: 2147483647;
    display: flex; gap: 2px;
    background: var(--cs-bg); border: 1px solid var(--cs-border);
    border-radius: 6px; padding: 3px 4px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.45);
    font-family: system-ui, -apple-system, sans-serif;
    animation: cs-bubble-in 150ms ease-out;
    color: var(--cs-text);
  }
  @keyframes cs-bubble-in {
    from { opacity: 0; transform: translateY(5px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .cs-btn {
    width: 24px; height: 24px; border: none; background: transparent;
    border-radius: 4px; cursor: pointer; font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    transition: background 100ms ease, transform 80ms ease;
    padding: 0; color: inherit;
  }
  .cs-btn:hover { background: var(--cs-btn-hover); }
  .cs-btn:active { background: var(--cs-btn-active); transform: scale(0.92); }

  .cs-popup {
    position: fixed; z-index: 2147483647;
    width: 320px; max-height: 280px;
    background: var(--cs-bg); border: 1px solid var(--cs-border);
    border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    font-family: system-ui, -apple-system, sans-serif;
    display: flex; flex-direction: column;
    overflow: hidden;
    animation: cs-popup-in 180ms ease-out;
    color: var(--cs-text);
  }
  @keyframes cs-popup-in {
    from { opacity: 0; transform: scale(0.9) translateY(-6px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  .cs-popup-header {
    display: flex; flex-direction: column;
    padding: 6px 12px 4px;
    border-bottom: 1px solid var(--cs-border);
    background: var(--cs-header-bg);
  }
  .cs-popup-drag-handle {
    display: flex; justify-content: center; align-items: flex-start;
    width: 100%; height: 8px; cursor: grab;
    color: var(--cs-muted); flex-shrink: 0;
    opacity: 0; transition: opacity 150ms;
  }
  .cs-popup:hover .cs-popup-drag-handle { opacity: 1; }
  .cs-popup-drag-handle:active { cursor: grabbing; }
  .cs-popup-drag-handle svg { width: 16px; height: 6px; }
  .cs-popup-header-main {
    display: flex; align-items: center; gap: 4px;
    width: 100%;
  }
  .cs-popup-icon { font-size: 14px; margin-right: 2px; }
  .cs-popup-title { font-size: 13px; font-weight: 600; color: var(--cs-text); margin-right: auto; }
  .cs-popup-open-external { margin-left: 4px; width: 26px; height: 26px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 14px; color: var(--cs-muted); display: flex; align-items: center; justify-content: center; transition: background 100ms; }
  .cs-popup-open-external:hover { background: var(--cs-btn-hover); color: var(--cs-text); }
  .cs-popup-pin { margin-left: 4px; }
  .cs-popup-close { margin-left: 4px; }
  .cs-popup-selected {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; border-bottom: 1px solid var(--cs-border);
    background: var(--cs-header-bg);
  }
  .cs-popup-selected-text {
    flex: 1; font-size: 12px; color: var(--cs-muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cs-popup-selected .cs-popup-copy {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 3px;
    opacity: 0.6;
    transition: opacity 100ms, background 100ms, color 100ms;
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cs-popup-selected .cs-popup-copy:hover {
    opacity: 1;
    background: var(--cs-btn-hover);
    color: var(--cs-primary);
  }
  .cs-popup-close {
    width: 26px; height: 26px; border: none; background: transparent;
    border-radius: 4px; cursor: pointer; font-size: 14px;
    color: var(--cs-muted); display: flex; align-items: center; justify-content: center;
    transition: background 100ms;
  }
  .cs-popup-close:hover { background: var(--cs-btn-hover); color: var(--cs-text); }
  .cs-popup-pin {
    width: 26px; height: 26px; border: none; background: transparent;
    border-radius: 4px; cursor: pointer; font-size: 14px;
    color: var(--cs-muted); display: flex; align-items: center; justify-content: center;
    transition: background 100ms, color 100ms;
  }
  .cs-popup-pin:hover { background: var(--cs-btn-hover); color: var(--cs-text); }
  .cs-popup-pin.pinned { color: var(--cs-primary); }
  .cs-popup-pin.pinned:hover { color: var(--cs-primary); }
  .cs-popup-body {
    flex: 1; padding: 12px; overflow-y: auto;
    font-size: 13px; line-height: 1.6; color: var(--cs-text);
    word-break: break-word; text-align: left;
  }
  .cs-popup-body::-webkit-scrollbar { width: 5px; }
  .cs-popup-body::-webkit-scrollbar-thumb { background: var(--cs-scrollbar); border-radius: 3px; }
  .cs-popup-actions {
    display: flex; justify-content: flex-end; gap: 4px;
    padding: 8px 12px; border-top: 1px solid var(--cs-border);
  }
  .cs-popup-action-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 4px 6px;
    border-radius: 3px;
    opacity: 0.6;
    transition: opacity 100ms, background 100ms, color 100ms;
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cs-popup-action-btn:hover {
    opacity: 1;
    background: var(--cs-btn-hover);
    color: var(--cs-primary);
  }
    flex: 1; font-size: 11px; color: var(--cs-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cs-popup-copy {
    padding: 4px 10px; border: 1px solid var(--cs-border); background: transparent;
    border-radius: 5px; cursor: pointer; font-size: 12px; color: var(--cs-muted);
    transition: all 100ms;
  }
  .cs-popup-copy:hover { border-color: var(--cs-primary); color: var(--cs-primary); }
  .cs-popup-copy.copied { border-color: var(--cs-success); color: var(--cs-success); }

  .cs-popup-loading {
    display: flex; flex-direction: row; align-items: center;
    justify-content: center; gap: 8px; padding: 28px 16px; color: var(--cs-muted);
    font-size: 13px;
  }

  /* Ask popup chat interface */
  .cs-popup-ask .cs-popup-body { display: none; }
  .cs-popup-ask .cs-popup-actions { display: none; }
  .cs-popup-chat-messages {
    flex: 1; overflow-y: auto; padding: 8px;
    display: flex; flex-direction: column; gap: 8px;
    max-height: 150px;
    align-items: flex-start;
  }
  .cs-popup-chat-message {
    padding: 6px 8px; border-radius: 6px; font-size: 12px; line-height: 1.4;
    word-wrap: break-word; position: relative;
    width: auto; max-width: 90%; text-align: left;
  }
  .cs-popup-chat-message-content {
    display: block;
  }
  /* Actions always visible */
  .cs-popup-chat-message-actions {
    display: flex; gap: 4px; position: absolute;
    opacity: 1;
  }
  /* User message - right aligned */
  .cs-popup-chat-message.user {
    background: var(--cs-primary); color: var(--cs-bg);
    margin-left: auto; width: auto; max-width: 90%;
  }
  /* User message actions - left side of bubble, always visible */
  .cs-popup-chat-message.user .cs-popup-chat-message-actions {
    left: -44px; top: 0;
  }
  /* Assistant message - left aligned */
  .cs-popup-chat-message.assistant {
    background: var(--cs-header-bg); color: var(--cs-text);
    width: auto; max-width: 90%; text-align: left;
  }
  /* Assistant message actions - below, right aligned, always visible */
  .cs-popup-chat-message.assistant .cs-popup-chat-message-actions {
    left: auto; right: 0; top: 100%; margin-top: 2px;
  }
  .cs-popup-chat-action-btn {
    background: transparent; border: none; cursor: pointer;
    padding: 2px; border-radius: 4px; color: var(--cs-text);
    opacity: 0.5; display: flex; align-items: center;
  }
  .cs-popup-chat-action-btn:hover { opacity: 1; }
  /* Loading state for ask popup */
  .cs-popup-chat-message.cs-popup-loading {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px; color: var(--cs-muted);
  }
  .cs-popup-chat-message.cs-popup-loading .loading-text {
    font-size: 12px;
  }
  .cs-popup-chat-message.cs-popup-loading .loading-dots {
    display: inline-flex; align-items: center; gap: 3px;
  }
  .cs-popup-chat-message.cs-popup-loading .dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.6;
    animation: cs-loading-dot 1.4s infinite ease-in-out both;
  }
  .cs-popup-chat-input-area {
    display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--cs-border);
    align-items: flex-end;
  }
  .cs-popup-chat-input {
    flex: 1; padding: 6px 8px; border: 1px solid var(--cs-border);
    border-radius: 6px; background: var(--cs-bg); color: var(--cs-text);
    font-size: 12px; resize: none; font-family: inherit;
    min-height: 24px; max-height: 60px;
  }
  .cs-popup-chat-input:focus { outline: none; border-color: var(--cs-primary); }
  .cs-popup-chat-send {
    width: 32px; height: 32px; border-radius: 6px;
    border: none; background: var(--cs-primary); color: var(--cs-bg); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .cs-popup-chat-send:hover { transform: translateY(-1px); }
  .cs-popup-chat-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .cs-popup-chat-send svg { width: 16px; height: 16px; }

  .loading-dots {
    display: inline-flex; align-items: center; gap: 3px;
  }
  .loading-dots .dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.6;
    animation: cs-loading-dot 1.4s infinite ease-in-out both;
  }
  .cs-spinner {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .cs-spinner.dots .dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.6;
    animation: cs-loading-dot 1.4s infinite ease-in-out both;
  }
  .cs-spinner.dots .dot:nth-child(1) { animation-delay: -0.32s; }
  .cs-spinner.dots .dot:nth-child(2) { animation-delay: -0.16s; }
  .cs-spinner.dots .dot:nth-child(3) { animation-delay: 0s; }
  @keyframes cs-loading-dot {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }
  .cs-spinner.spin, .cs-spin {
    width: 22px; height: 22px;
    border: 2px solid var(--cs-border);
    border-top-color: var(--cs-primary);
    border-radius: 50%;
    animation: cs-spin 600ms linear infinite;
  }
  @keyframes cs-spin {
    to { transform: rotate(360deg); }
  }

  .cs-popup-error {
    padding: 12px; color: var(--cs-error); font-size: 13px;
  }

  /* === Radial Menu === */
  .cs-radial-btn {
    position: fixed;
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--cs-bg);
    border: 1px solid var(--cs-border);
    box-shadow: 0 2px 12px rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    pointer-events: all;
    opacity: 0;
    transform: scale(0);
    transition:
      opacity 200ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
    overflow: visible;
    padding: 0;
  }
  .cs-radial-btn.expanded {
    opacity: 1;
    transform: scale(1);
  }
  .cs-radial-btn.expanded:hover {
    background: var(--cs-btn-hover);
  }
  .cs-radial-btn.expanded:active {
    transform: scale(0.95);
  }
  .cs-radial-backdrop {
    position: fixed; inset: 0; z-index: 2147483644;
    pointer-events: none;
    opacity: 0;
    transition: opacity 200ms;
  }
  .cs-radial-backdrop.visible {
    opacity: 1;
  }
  .cs-radial-container {
    position: fixed; z-index: 2147483645;
    pointer-events: none;
  }
  .cs-radial-btn > span {
    display: flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
  }
  .cs-radial-label {
    position: absolute; white-space: nowrap;
    font-size: 11px; font-family: system-ui, sans-serif;
    color: var(--cs-text);
    background: var(--cs-bg);
    border: 1px solid var(--cs-border);
    padding: 2px 7px; border-radius: 10px;
    pointer-events: none;
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 150ms 80ms, transform 150ms 80ms;
    bottom: 50%;
    right: calc(100% + 6px);
  }
  .cs-radial-btn:hover .cs-radial-label {
    opacity: 1;
    transform: scale(1);
  }

  /* === Persistent Dock Ball === */
  .cs-dock {
    position: fixed; bottom: 48px; right: 24px; z-index: 2147483646;
    width: 32px; height: 32px; border-radius: 50%;
    background-color: transparent;
    background-size: cover; background-position: center; background-repeat: no-repeat;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s, right 0.4s ease, bottom 0.4s ease, box-shadow 0.2s;
    user-select: none; border: none; overflow: visible; padding: 0;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
  }
  .cs-dock:hover { transform: scale(1.12); }
  .cs-dock:active { transform: scale(0.95); }
  .cs-dock.menu-open { background-image: none; }
  .cs-dock.menu-open:hover { transform: scale(1.08) rotate(90deg); }
  .cs-dock.menu-open:active { transform: scale(0.95) rotate(90deg); }
  .cs-dock.sticking {
    right: 8px !important;
    transition: right 0.4s ease, bottom 0.4s ease, transform 0.2s, box-shadow 0.2s;
  }
  .cs-dock.scrolling { transition: none !important; }
  .cs-dock.panel-open {
    box-shadow: 0 0 20px rgba(102, 119, 255, 0.7);
  }
  .cs-dock-icon {
    position: absolute; inset: 0;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
    background: rgba(0,0,0,0);
    color: #fff;
    transition: background 200ms, opacity 200ms;
    font-size: 16px; line-height: 1; font-weight: 400;
    opacity: 0;
  }
  .cs-dock.menu-open .cs-dock-icon {
    background: rgba(60,60,60,0.78);
    opacity: 1;
  }

  .cs-icon {
    width: 16px; height: 16px; flex-shrink: 0;
  }
  .cs-icon-sm {
    width: 14px; height: 14px; flex-shrink: 0;
  }

  /* Global page translation */
  .cs-page-translated {
    /* marker class on body */
  }
  .cs-translation {
    display: block;
    margin-top: 4px;
    padding: 8px 12px;
    background: rgba(88, 166, 255, 0.1);
    border-left: 3px solid #58a6ff;
    color: var(--cs-text);
    font-size: 0.95em;
    line-height: 1.5;
  }
  .cs-translation.cs-loading {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
    color: var(--cs-primary);
  }
  .cs-translation.cs-error {
    display: inline-block;
    color: var(--cs-error);
    border-left-color: var(--cs-error);
  }
  .cs-translation.hidden {
    display: none;
  }
`;

/** Inject the content-script CSS bundle into the page. */
function injectStyles() {
  if (document.getElementById('clawside-styles')) return;
  const s = document.createElement('style');
  s.id = 'clawside-styles';
  s.textContent = CONTENT_STYLES;
  document.head.appendChild(s);
}

// Expose globals for non-module scripts (content.js, popup.js, and dock.js are not ES modules)
window.THEMES = THEMES;
window.PAGE_THEMES = PAGE_THEMES;
window.resolveAppearance = resolveAppearance;
window.detectPageTheme = detectPageTheme;
window.injectTheme = injectTheme;
window.injectStyles = injectStyles;
