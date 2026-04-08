// ClawSide - URL Utilities
// Common URL handling functions.

(function() {
  'use strict';

  /**
   * Generate a short hash string from URL for storage keys.
   * Uses origin + pathname (ignores query/hash for privacy/consistency).
   *
   * @param {string} url - The URL to hash
   * @returns {string} - Hash string (base-36)
   */
  function hashUrl(url) {
    if (!url) return 'none';
    try {
      const u = new URL(url);
      const key = u.origin + u.pathname;
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    } catch {
      // Fallback for invalid URLs
      let hash = 0;
      for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }
  }

  // Expose globally for non-module scripts
  window.hashUrl = hashUrl;
})();