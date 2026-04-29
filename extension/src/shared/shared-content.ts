/**
 * ClawSide - Shared Dependencies for Content Scripts
 * Sets window globals needed by popup.js and dock.js
 * MUST be loaded first in content_scripts via manifest
 */
import '../tools/lru-cache';
import '../tools/context-lru-cache';
import '../tools/chat-lru-cache';
import '../tools/url-utils';
import '../shared/tab-context-manager';
import '../shared/settings';
import '../shared/chat-session';
import '../tools/browser';

// After imports above have set window globals, just log for debugging
// Force code inclusion by referencing the imported values
console.log('[ClawSide] Shared loaded, tabContextManager:', typeof window.tabContextManager,
  ', LRUCache:', typeof window.LRUCache,
  ', ContextLRUCache:', typeof window.ContextLRUCache,
  ', i18n:', typeof window.i18n,
  ', hashUrl:', typeof window.hashUrl);