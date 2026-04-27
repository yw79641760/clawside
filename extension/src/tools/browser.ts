/**
 * ClawSide - Browser Utilities
 * Browser-environment capabilities: clipboard, storage wrapper.
 * Language utilities moved to lang-utils.js.
 */

/**
 * Get i18n message safely (avoids context invalidated errors).
 * @param key - The i18n message key
 * @returns The translated message, or the key if not found
 */
export function i18n(key: string): string {
  try {
    return chrome.i18n.getMessage(key) || key;
  } catch {
    return key;
  }
}

/**
 * Copy plain text to the clipboard.
 * @param text - The text to copy
 * @returns True on success, false on failure
 */
export async function copyToClipboard(text: string): Promise<boolean> {
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
