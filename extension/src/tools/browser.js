// ClawSide - Browser Utilities
// Browser-environment capabilities: language detection, clipboard, storage wrapper.
// Shared across content script and side panel.

/**
 * Get the browser's display-language label (e.g. 'Chinese', 'Japanese', 'English').
 * Used by side panel settings to show detected browser language.
 */
function getBrowserLocale() {
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
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a language setting ('auto', 'Chinese', 'Japanese', ...) to a short code.
 */
function resolveLang(lang, browserLang) {
  browserLang = browserLang || 'en';
  if (lang === 'auto') {
    if (browserLang.slice(0, 2) === 'zh') return 'zh';
    if (browserLang.slice(0, 2) === 'ja') return 'ja';
    return 'en';
  }
  if (lang === 'Chinese')  return 'zh';
  if (lang === 'Japanese') return 'ja';
  return 'en';
}

/**
 * Get the short browser language code from navigator.
 */
function getBrowserLang() {
  var l = navigator.language || '';
  if (l.slice(0, 2) === 'zh') return 'zh';
  if (l.slice(0, 2) === 'ja') return 'ja';
  return 'en';
}

// Expose globals for non-module scripts (sidepanel.html uses <script> not type="module")
window.getBrowserLocale = getBrowserLocale;
window.copyToClipboard  = copyToClipboard;
window.resolveLang       = resolveLang;
window.getBrowserLang    = getBrowserLang;
