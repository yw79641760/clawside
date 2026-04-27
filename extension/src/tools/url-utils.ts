/**
 * ClawSide - URL Utilities
 * Common URL handling functions.
 */

'use strict';

/**
 * Generate a short hash string from URL for storage keys.
 * Uses origin + pathname (ignores query/hash for privacy/consistency).
 *
 * @param url - The URL to hash
 * @returns Hash string (base-36)
 */
export function hashUrl(url: string | null | undefined): string {
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
