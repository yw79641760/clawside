// ClawSide - Browser Utilities
// Browser-environment capabilities: language detection, clipboard, storage wrapper.
// Shared across content script and side panel.

/**
 * Get the browser's display-language label (e.g. 'Chinese', 'Japanese', 'English').
 * Used by side panel settings to show detected browser language.
 */
export function getBrowserLocale() {
  const lang = navigator.language || navigator.userLanguage || 'en';
  const map = {
    'zh': 'Chinese', 'zh-CN': 'Chinese', 'zh-TW': 'Chinese', 'zh-HK': 'Chinese',
    'ja': 'Japanese', 'ko': 'Korean',
    'fr': 'French', 'de': 'German', 'es': 'Spanish', 'ru': 'Russian',
    'en': 'English',
  };
  return map[lang] || map[lang.split('-')[0]] || 'English';
}

/**
 * Copy plain text to the clipboard. Returns true on success.
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Expose globals for non-module scripts (sidepanel.html uses <script> not type="module")
window.getBrowserLocale = getBrowserLocale;
window.copyToClipboard = copyToClipboard;
