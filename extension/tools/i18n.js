// ClawSide - i18n
// Handles loading and resolving the i18n JSON bundle for both content scripts and side panel.

/** Load the i18n bundle (cached). Returns { en: {}, zh: {}, ja: {} }. */
let _i18nCache = null;
export async function loadI18n() {
  if (_i18nCache) return _i18nCache;
  try {
    const res = await fetch(chrome.runtime.getURL('i18n.json'));
    _i18nCache = await res.json();
  } catch {
    _i18nCache = { en: {}, zh: {}, ja: {} };
  }
  return _i18nCache;
}

/** Resolve a language setting to a short code: 'zh' | 'ja' | 'en'. */
export function resolveLang(lang, browserLang = 'en') {
  if (lang === 'auto') return browserLang === 'zh' ? 'zh' : browserLang === 'ja' ? 'ja' : 'en';
  return lang === 'Chinese' ? 'zh' : lang === 'Japanese' ? 'ja' : 'en';
}

/**
 * Get the short browser language code: 'zh' | 'ja' | 'en'.
 * Used for 'auto' mode in both content script and side panel.
 */
export function getBrowserLang() {
  const l = navigator.language || '';
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('ja')) return 'ja';
  return 'en';
}

// Expose globals for non-module scripts (sidepanel.html uses <script> not type="module")
window.loadI18n = loadI18n;
window.resolveLang = resolveLang;
window.getBrowserLang = getBrowserLang;
