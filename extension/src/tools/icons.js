// ClawSide - Icons
// Single source of truth for all SVG icon markup.
// All icons reference the inline <symbol> sprite defined in sidepanel.html.
// For content scripts: ensure the sprite is injected into the page first (see tools/appearance.js).

const ICON_NAMES = ['translate', 'summarize', 'ask', 'copy', 'check', 'delete', 'eye', 'eyeoff', 'history', 'settings', 'loading', 'error', 'cancel'];

/** SVG markup map: iconName → <svg> string for use in innerHTML. */
const SVG = {
  translate:  '<svg class="cs-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-translate"></use></svg>',
  summarize:  '<svg class="cs-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-summarize"></use></svg>',
  ask:        '<svg class="cs-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-ask"></use></svg>',
  copy:       '<svg class="cs-icon" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-copy"></use></svg>',
  check:      '<svg class="cs-icon" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-check"></use></svg>',
  delete:     '<svg class="cs-icon" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-delete"></use></svg>',
  eye:        '<svg class="cs-icon" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-eye"></use></svg>',
  eyeoff:     '<svg class="cs-icon" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-eye-off"></use></svg>',
  history:    '<svg class="cs-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-history"></use></svg>',
  settings:   '<svg class="cs-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-settings"></use></svg>',
  loading:    '<svg class="cs-icon cs-spin" width="20" height="20" viewBox="0 0 24 24"><use href="#cs-icon-loading"></use></svg>',
  error:      '<svg class="cs-icon" width="20" height="20" viewBox="0 0 24 24"><use href="#cs-icon-error"></use></svg>',
  cancel:     '<svg class="cs-icon" width="20" height="20" viewBox="0 0 24 24"><use href="#cs-icon-cancel"></use></svg>',
};

/** Get SVG markup for an icon by name. Returns '' if not found. */
function svgIcon(name) {
  return SVG[name] || '';
}

// Expose globals for non-module scripts (sidepanel.html uses <script> not type="module")
window.SVG = SVG;
window.svgIcon = svgIcon;
window.injectSprite = injectSprite;

/** Content script: inject the SVG sprite into the page DOM so <use href="#cs-icon-..."> resolves. */
async function injectSprite(spriteUrl) {
  if (document.getElementById('cs-sprite')) return;
  try {
    const res = await fetch(spriteUrl);
    const text = await res.text();
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:none';
    wrapper.innerHTML = text;
    document.body.appendChild(wrapper);
  } catch { /* sprite unavailable, icons fall back to empty string */ }
}
