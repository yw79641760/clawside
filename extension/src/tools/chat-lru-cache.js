// ClawSide - Chat LRU Cache
// LRU cache for chat sessions, keyed by tabId + URL.
// Persists to chrome.storage.local.

(function() {
  'use strict';

  /**
   * ChatLRUCache - LRU cache for chat sessions.
   * Key = tabId + urlHash, Value = messages array.
   * Uses window.hashUrl from url-utils.js for URL hashing.
   */
  class ChatLRUCache extends window.LRUCache {
    constructor(options = {}) {
      const maxSize = options.maxSize || 50;

      super({
        maxSize,
        makeKey: (tabId, url) => `clawside_chat_${tabId}_${hashUrl(url)}`,
        onEvict: (key, value) => {
          // Persist deletion when evicted
          chrome.storage.local.remove([key]).catch(() => {});
        }
      });

      this.tabId = options.tabId || null;
      this.url = options.url || '';
      this._loaded = false;
    }

    /**
     * Create key from tabId and URL.
     *
     * @param {number|string} tabId
     * @param {string} url
     * @returns {string}
     */
    makeKey(tabId, url) {
      return `clawside_chat_${tabId}_${hashUrl(url)}`;
    }

    /**
     * Get or create chat session for current tabId + url.
     * Loads from storage if not in memory.
     *
     * @returns {Promise<Array>} messages array
     */
    /**
     * Get or build chat session.
     *
     * @param {number|string} tabId (optional, uses this.tabId if not provided)
     * @param {string} url (optional, uses this.url if not provided)
     * @returns {Promise<Array>} messages array
     */
    async getOrBuild(tabId = null, url = '') {
      const buildTabId = tabId || this.tabId;
      const buildUrl = url || this.url;
      if (!buildTabId) {
        return [];
      }

      const key = this.makeKey(buildTabId, buildUrl);

      // Check memory cache first
      if (this.has(key)) {
        // Move to end (MRU)
        const value = this.get(key);
        this.delete(key);
        this.set(key, value);
        return value;
      }

      // Load from storage
      try {
        const result = await chrome.storage.local.get([key]);
        const messages = result[key] || [];

        // Add to cache
        this.set(key, messages);
        return messages;
      } catch (err) {
        console.error('[ChatLRUCache] Load error:', err);
        return [];
      }
    }

    /**
     * Save current session to storage.
     *
     * @param {Array} messages
     * @param {number|string} tabId (optional, uses this.tabId if not provided)
     * @param {string} url (optional, uses this.url if not provided)
     * @returns {Promise<void>}
     */
    async save(messages, tabId = null, url = '') {
      const saveTabId = tabId || this.tabId;
      const saveUrl = url || this.url;

      // Only save if there are actual messages
      if (!messages || messages.length === 0) {
        return;
      }

      if (!saveTabId) {
        return;
      }
      const key = this.makeKey(saveTabId, saveUrl);
      this.set(key, messages);
      try {
        await chrome.storage.local.set({ [key]: messages });
      } catch (err) {
        console.error('[ChatLRUCache] Save error:', err);
      }
    }

    /**
     * Update tabId and url, reload session if exists.
     *
     * @param {number|string} tabId
     * @param {string} url
     * @returns {Promise<Array>} messages for new context
     */
    async switchContext(tabId, url) {
      this.tabId = tabId;
      this.url = url || '';
      return this.getOrBuild();
    }

    /**
     * Clear all chat sessions from memory and storage.
     *
     * @returns {Promise<void>}
     */
    async clearAll() {
      this.clear();
      try {
        const keys = await chrome.storage.local.get(null);
        const chatKeys = Object.keys(keys).filter(k => k.startsWith('clawside_chat_'));
        if (chatKeys.length > 0) {
          await chrome.storage.local.remove(chatKeys);
        }
      } catch (err) {
        console.error('[ChatLRUCache] Clear error:', err);
      }
    }

    /**
     * Get count of all stored sessions (including from storage).
     *
     * @returns {Promise<number>}
     */
    async getTotalCount() {
      try {
        const keys = await chrome.storage.local.get(null);
        const chatKeys = Object.keys(keys).filter(k => k.startsWith('clawside_chat_'));
        return chatKeys.length;
      } catch {
        return this.size;
      }
    }
  }

  // Expose to global scope
  window.ChatLRUCache = ChatLRUCache;

})();