// ClawSide - Styles & Theme
// Handles theme variable injection and the shared content-script CSS bundle.
// Used by content.js only (the side panel uses sidepanel.css loaded via <link>).

/** Theme CSS variable sets for the floating-ball / popup / radial-menu UI. */
export const THEMES = {
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

/** Determine effective appearance from setting + system preference. */
export function resolveAppearance(appearanceSetting = 'system') {
  if (appearanceSetting === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return appearanceSetting;
}

/** Inject CSS custom-property theme variables into the page document root. */
export function injectTheme(vars) {
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

/** Content-script CSS bundle for bubble, popup, radial menu, and dock. */
export const CONTENT_STYLES = `
  .cs-bubble {
    position: fixed; z-index: 2147483647;
    display: flex; gap: 4px;
    background: var(--cs-bg); border: 1px solid var(--cs-border);
    border-radius: 8px; padding: 5px 7px;
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
    width: 34px; height: 34px; border: none; background: transparent;
    border-radius: 6px; cursor: pointer; font-size: 17px;
    display: flex; align-items: center; justify-content: center;
    transition: background 100ms ease, transform 80ms ease;
    padding: 0;
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
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; border-bottom: 1px solid var(--cs-border);
    background: var(--cs-header-bg);
  }
  .cs-popup-icon { font-size: 14px; }
  .cs-popup-title { flex: 1; font-size: 13px; font-weight: 600; color: var(--cs-text); }
  .cs-popup-close {
    width: 26px; height: 26px; border: none; background: transparent;
    border-radius: 4px; cursor: pointer; font-size: 14px;
    color: var(--cs-muted); display: flex; align-items: center; justify-content: center;
    transition: background 100ms;
  }
  .cs-popup-close:hover { background: var(--cs-btn-hover); color: var(--cs-text); }
  .cs-popup-body {
    flex: 1; padding: 12px; overflow-y: auto;
    font-size: 13px; line-height: 1.6; color: var(--cs-text);
    word-break: break-word;
  }
  .cs-popup-body::-webkit-scrollbar { width: 5px; }
  .cs-popup-body::-webkit-scrollbar-thumb { background: var(--cs-scrollbar); border-radius: 3px; }
  .cs-popup-footer {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; border-top: 1px solid var(--cs-border);
  }
  .cs-popup-cite {
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
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px; padding: 28px 16px; color: var(--cs-muted);
    font-size: 13px;
  }
  .cs-spinner {
    width: 22px; height: 22px; border: 2px solid var(--cs-border);
    border-top-color: var(--cs-primary); border-radius: 50%;
    animation: cs-spin 600ms linear infinite;
  }
  @keyframes cs-spin { to { transform: rotate(360deg); } }

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
    position: fixed; bottom: 24px; right: 24px; z-index: 2147483646;
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
`;

/** Inject the content-script CSS bundle into the page. */
export function injectStyles() {
  if (document.getElementById('clawside-styles')) return;
  const s = document.createElement('style');
  s.id = 'clawside-styles';
  s.textContent = CONTENT_STYLES;
  document.head.appendChild(s);
}
