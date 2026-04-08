// ClawSide - Browser Utilities
// Browser-environment capabilities: clipboard, storage wrapper.
// Language utilities moved to lang-utils.js.

/**
 * Get i18n message safely (avoids context invalidated errors).
 */
function i18n(key) {
  try {
    return chrome.i18n.getMessage(key) || key;
  } catch (e) {
    return key;
  }
}

/**
 * Copy plain text to the clipboard. Returns true on success.
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Expose globals for non-module scripts
window.i18n = i18n;
window.copyToClipboard = copyToClipboard;
