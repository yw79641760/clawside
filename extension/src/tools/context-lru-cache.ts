// ClawSide - Context LRU Cache
// LRU cache for tab context data, with dual-size limits.
// Used by TabContextMap to manage tab contexts with map-size and lru-size limits.

(function() {
  'use strict';

  /**
   * ContextLRUCache - LRU cache with dual size limits.
   *
   * @param {Object} options
   * @param {number} options.maxMapSize - Max entries in map (default: 50)
   * @param {number} options.maxLruSize - Max entries in LRU tracking (default: 10)
   * @param {Function} options.onEvict - Optional callback when entry is evicted
   */
  class ContextLRUCache extends window.LRUCache {
    constructor(options = {}) {
      const maxMapSize = options.maxMapSize || 50;
      const maxLruSize = options.maxLruSize || 10;

      super({
        maxSize: maxMapSize, // Map size limit
        makeKey: (key) => String(key),
        onEvict: (key, value) => {
          if (options.onEvict) {
            options.onEvict(key, value);
          }
        }
      });

      this._maxLruSize = maxLruSize;
      this._lru = []; // LRU order tracking (most recent at end)
    }

    /**
     * Set a value. Updates LRU order and enforces both size limits.
     *
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
      const k = String(key);

      // If key exists, remove from LRU first (will re-add at end)
      if (this.cache.has(k)) {
        this._removeFromLru(k);
      }

      // Evict oldest from map if at capacity
      while (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        const evicted = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        this._removeFromLru(oldestKey);
        if (this.onEvict) {
          this.onEvict(oldestKey, evicted);
        }
      }

      // Evict oldest from LRU if at capacity
      while (this._lru.length >= this._maxLruSize) {
        this._lru.shift();
      }

      this.cache.set(k, value);
      this._lru.push(k);
    }

    /**
     * Get a value. Updates LRU order (moves to end).
     *
     * @param {string} key
     * @returns {any|null}
     */
    get(key) {
      const k = String(key);
      const value = this.cache.get(k);
      if (value) {
        this._touchLru(k);
      }
      return value || null;
    }

    /**
     * Remove a specific entry.
     *
     * @param {string} key
     * @returns {boolean}
     */
    delete(key) {
      const k = String(key);
      if (this.cache.has(k)) {
        const evicted = this.cache.get(k);
        this.cache.delete(k);
        this._removeFromLru(k);
        if (this.onEvict) {
          this.onEvict(k, evicted);
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
      this._lru = [];
    }

    /**
     * Move key to end of LRU (most recently used).
     *
     * @param {string} key
     * @private
     */
    _touchLru(key) {
      this._removeFromLru(key);
      this._lru.push(key);
    }

    /**
     * Remove key from LRU list.
     *
     * @param {string} key
     * @private
     */
    _removeFromLru(key) {
      const idx = this._lru.indexOf(key);
      if (idx !== -1) {
        this._lru.splice(idx, 1);
      }
    }

    /**
     * Get current LRU size.
     *
     * @returns {number}
     */
    get lruSize() {
      return this._lru.length;
    }

    /**
     * Check if key is in LRU list.
     *
     * @param {string} key
     * @returns {boolean}
     */
    isLru(key) {
      return this._lru.indexOf(String(key)) !== -1;
    }

    /**
     * Get all keys in LRU order (oldest first).
     *
     * @returns {string[]}
     */
    get lruKeys() {
      return [...this._lru];
    }

    /**
     * Serialize to plain object for storage.
     *
     * @returns {Object}
     */
    toJSON() {
      const out = {};
      for (const [k, v] of this.cache) {
        out[k] = v;
      }
      return out;
    }

    /**
     * Load from serialized data.
     *
     * @param {Object} data
     */
    fromJSON(data) {
      this.clear();
      if (!data) return;
      for (const key in data) {
        this.set(key, data[key]);
      }
    }
  }

  // Expose to global scope
  window.ContextLRUCache = ContextLRUCache;

})();