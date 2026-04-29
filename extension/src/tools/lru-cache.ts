// ClawSide - Generic LRU Cache
// A generic Least Recently Used cache implementation.
// Subclasses can provide custom key generation and storage logic.

(function() {
  'use strict';

  /**
   * Generic LRU Cache with customizable key generation and storage.
   *
   * @param {Object} options
   * @param {number} options.maxSize - Maximum number of entries (default: 50)
   * @param {Function} options.makeKey - Function to generate storage key from params
   * @param {Function} options.onEvict - Optional callback when entry is evicted
   */
  class LRUCache {
    constructor(options = {}) {
      this.maxSize = options.maxSize || 50;
      this.makeKey = options.makeKey || ((...args) => args.join(':'));
      this.onEvict = options.onEvict || null;

      // Use Map to maintain insertion order (LRU at head, MRU at tail)
      this.cache = new Map();
    }

    /**
     * Get entry by key, or build if not exists.
     * Updates access order (moves to end).
     *
     * @param {...any} keyArgs - Arguments passed to makeKey
     * @param {Function} builder - Async function to create entry if not exists
     * @returns {Promise<any>}
     */
    async getOrBuild(...keyArgs) {
      const key = this.makeKey(...keyArgs);

      if (this.cache.has(key)) {
        // Move to end (most recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
      }

      // Entry not found - let builder create it
      const value = await this._build(key, ...keyArgs);
      return value;
    }

    /**
     * Override this to provide custom build logic.
     * Default just returns null (subclass should override).
     */
    async _build(key, ...keyArgs) {
      return null;
    }

    /**
     * Set a value directly.
     * If cache is full, evicts least recently used entry.
     *
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
      // If key exists, delete first (will re-add at end)
      if (this.cache.has(key)) {
        this.cache.delete(key);
      }

      // Evict oldest if at capacity
      while (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        const evicted = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        if (this.onEvict) {
          this.onEvict(oldestKey, evicted);
        }
      }

      this.cache.set(key, value);
    }

    /**
     * Get value without updating access order.
     *
     * @param {string} key
     * @returns {any|null}
     */
    get(key) {
      return this.cache.get(key) || null;
    }

    /**
     * Check if key exists.
     *
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
      return this.cache.has(key);
    }

    /**
     * Delete a specific entry.
     *
     * @param {string} key
     * @returns {boolean}
     */
    delete(key) {
      if (this.cache.has(key)) {
        const evicted = this.cache.get(key);
        this.cache.delete(key);
        if (this.onEvict) {
          this.onEvict(key, evicted);
        }
        return true;
      }
      return false;
    }

    /**
     * Clear all entries.
     */
    clear() {
      if (this.onEvict) {
        for (const [key, value] of this.cache) {
          this.onEvict(key, value);
        }
      }
      this.cache.clear();
    }

    /**
     * Get current size.
     *
     * @returns {number}
     */
    get size() {
      return this.cache.size;
    }

    /**
     * Get all keys in LRU order (oldest first).
     *
     * @returns {string[]}
     */
    keys() {
      return Array.from(this.cache.keys());
    }

    /**
     * Get all values in LRU order.
     *
     * @returns {any[]}
     */
    values() {
      return Array.from(this.cache.values());
    }

    /**
     * Get entries as array of [key, value] in LRU order.
     *
     * @returns {Array<[string, any]>}
     */
    entries() {
      return Array.from(this.cache.entries());
    }
  }

  // Expose to global scope
  window.LRUCache = LRUCache;

})();