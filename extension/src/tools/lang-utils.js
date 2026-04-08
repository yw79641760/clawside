// ClawSide - Language Utilities
// Language detection and conversion utilities.
// Used across content script and side panel.

(function() {
  'use strict';

  /**
   * Get browser's display-language label (e.g. 'Chinese', 'Japanese', 'English').
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
   * Get browser's short language code (e.g. 'zh', 'ja', 'en').
   */
  function getBrowserLang() {
    const l = navigator.language || '';
    if (l.slice(0, 2) === 'zh') return 'zh';
    if (l.slice(0, 2) === 'ja') return 'ja';
    return 'en';
  }

  /**
   * Resolve language setting to short code.
   * @param {string} lang - Language setting ('auto', 'Chinese', 'Japanese', etc.)
   * @param {string} browserLocale - Browser display language (e.g. 'Chinese')
   * @returns {string} - Short code ('zh', 'ja', 'en')
   */
  function resolveToCode(lang, browserLocale) {
    browserLocale = browserLocale || 'English';
    if (lang === 'auto') {
      if (browserLocale === 'Chinese') return 'zh';
      if (browserLocale === 'Japanese') return 'ja';
      return 'en';
    }
    if (lang === 'Chinese') return 'zh';
    if (lang === 'Japanese') return 'ja';
    return 'en';
  }

  /**
   * Convert short language code to display label.
   * @param {string} langCode - Short code ('zh', 'ja', 'en')
   * @returns {string} - Display label ('Chinese', 'Japanese', 'English')
   */
  function codeToLabel(langCode) {
    if (langCode === 'zh') return 'Chinese';
    if (langCode === 'ja') return 'Japanese';
    return 'English';
  }

  /**
   * Convert short language code to display label with native script (for settings UI).
   * @param {string} langCode - Short code ('zh', 'ja', 'en')
   * @returns {string} - Display label with native script
   */
  function codeToLabelNative(langCode) {
    if (langCode === 'zh') return 'Chinese (中文)';
    if (langCode === 'ja') return 'Japanese (日本語)';
    return 'English';
  }

  /**
   * Get target language for translate.
   * Accepts settings object and returns display label directly.
   * @param {Object} settings - Settings object (with translateLanguage and language properties)
   * @returns {string} - Display label ('Chinese', 'Japanese', 'English')
   */
  function getTranslateLabel(settings) {
    const browserLocale = getBrowserLocale();
    const translateLang = settings?.translateLanguage;
    const generalLang = settings?.language;

    // translateLanguage takes priority
    if (translateLang && translateLang !== 'auto') {
      const code = resolveToCode(translateLang, browserLocale);
      return codeToLabel(code);
    }

    // Fall back to general language setting
    if (generalLang && generalLang !== 'auto') {
      const code = resolveToCode(generalLang, browserLocale);
      return codeToLabel(code);
    }

    // Fall back to browser locale
    return browserLocale;
  }

  /**
   * Get reply language for ask/summarize.
   * Accepts settings object and returns display label directly.
   * @param {Object} settings - Settings object (with language property)
   * @returns {string} - Display label ('Chinese', 'Japanese', 'English')
   */
  function getReplyLabel(settings) {
    const browserLocale = getBrowserLocale();
    const lang = settings?.language;

    if (lang && lang !== 'auto') {
      const code = resolveToCode(lang, browserLocale);
      return codeToLabel(code);
    }

    // Fall back to browser locale
    return browserLocale;
  }

  // Expose globals
  window.getBrowserLocale = getBrowserLocale;
  window.getBrowserLang = getBrowserLang;
  window.resolveToCode = resolveToCode;
  window.codeToLabel = codeToLabel;
  window.codeToLabelNative = codeToLabelNative;
  window.getTranslateLabel = getTranslateLabel;
  window.getReplyLabel = getReplyLabel;

})();