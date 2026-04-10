// ClawSide - Chat Session Manager
// Manages multi-turn conversation history per tab + URL
// Uses ChatLRUCache for LRU storage with automatic cleanup

(function() {
  'use strict';

  // Max chars of page body injected into Ask system prompt (TCM often caps at ~10k).
  var ASK_PAGE_CONTENT_MAX = 12000;

  class ChatSession {
    constructor(tabId, url = '', lruCache = null) {
      this.tabId = tabId;
      this.url = url || '';
      this.lruCache = lruCache;
      this.messages = [];
      this.context = {
        url: '',
        title: '',
        content: '',
        selectedText: ''
      };
    }

    // Get storage key for this session
    getStorageKey() {
      return this.lruCache ? this.lruCache.makeKey(this.tabId, this.url) : `clawside_chat_${this.tabId}`;
    }

    // Switch to different tab/url context
    async switchContext(tabId, url) {
      // Save current before switching
      if (this.lruCache) {
        await this.lruCache.save(this.messages);
      }

      this.tabId = tabId;
      this.url = url || '';
      this.messages = [];
      this.context = {
        url: '',
        title: '',
        content: '',
        selectedText: ''
      };

      // Load messages for new context
      if (this.lruCache) {
        this.messages = await this.lruCache.switchContext(tabId, url);
      }

      return this.messages;
    }

    // Set page context for the conversation
    setContext({ url, title, content, selectedText }) {
      this.context = { url, title, content, selectedText };
    }

    // Add user message
    addUserMessage(content, timestamp = null, from = 'ask') {
      const msg = {
        role: 'user',
        content,
        from: from,
        timestamp: timestamp || Date.now()
      };
      this.messages.push(msg);
      return msg;
    }

    // Add assistant message (initially empty for streaming)
    addAssistantMessage(content = '', timestamp = null, from = 'ask') {
      const msg = {
        role: 'assistant',
        content,
        from: from,
        timestamp: timestamp || Date.now()
      };
      this.messages.push(msg);
      return msg;
    }

    // Check if conversation has previous ask messages (not summarize context)
    hasPreviousAsk() {
      // Check for completed ask exchanges: assistant messages with from='ask' and non-empty content
      // User's just-added message hasn't been responded to yet, so we only check assistant with content
      return this.messages.some(msg =>
        msg.from === 'ask' &&
        msg.role === 'assistant' &&
        msg.content &&
        String(msg.content).trim().length > 0
      );
    }

    // Update last assistant message (for streaming)
    updateLastAssistantMessage(content) {
      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content = content;
      }
    }

    // Get last N messages for API prompt (default: all)
    getMessages(count = null) {
      if (!count || count >= this.messages.length) {
        return this.messages;
      }
      return this.messages.slice(-count);
    }

    // Build API request prompt (plain text) for better LLM adherence.
    // Structure:
    //   System: [tool definition and capabilities - no page content]
    //   User: [page context: title + url + (content if first ask)] + [user question]
    //   Assistant:
    // @param {boolean} includeFullContext - if true, include full page context (title + url + content) for first ask
    //                                       if false, include only title + url (for follow-up questions)
    async buildPrompt() {
      // Get ask prompt template from settings
      var templates = window.csSettings ? window.csSettings.getPromptTemplates(window.csSettings.getDefaultSettings(), 'ask') : null;
      if (!templates) {
        console.error('[ChatSession] No ask prompt template found');
        return '';
      }

      var applyFn = window.csSettings ? window.csSettings.applyPrompt : null;
      if (!applyFn) {
        console.error('[ChatSession] No applyPrompt function found');
        return '';
      }

      // Build page context variables
      // Use hasPreviousAsk() to determine whether to include page content
      var pageContent = '';
      var includeContent = !this.hasPreviousAsk();
      if (includeContent && this.context.content && String(this.context.content).trim()) {
        var body = String(this.context.content).trim();
        var truncated = body.length > ASK_PAGE_CONTENT_MAX
          ? body.slice(0, ASK_PAGE_CONTENT_MAX)
          : body;
        pageContent = truncated + (body.length > ASK_PAGE_CONTENT_MAX ? '\n[Truncated]' : '');
      }

      // Find the last user message (skip empty assistant placeholder if any)
      const lastMsg = this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
      const lastUserMsg = lastMsg?.role === 'user' ? lastMsg : this.messages.slice().reverse().find(m => m.role === 'user');
      var question = lastUserMsg ? lastUserMsg.content : '';

      // Prepare variables for prompt template
      // Use lang-utils to get reply language label from actual saved settings
      var langLabel = 'English';
      if (window.getReplyLabel && window.csSettings) {
        var currentSettings = window.csSettings._settings || window.csSettings.getDefaultSettings();
        langLabel = window.getReplyLabel(currentSettings);
      }
      var promptVars = {
        title: this.context.title || '',
        url: this.context.url || '',
        selectedText: this.context.selectedText || '',
        content: pageContent,
        question: question,
        lang: langLabel
      };

      // Use settings prompt template
      var systemPrompt = applyFn(templates.system, promptVars);
      var userPrompt = applyFn(templates.user, promptVars);

      // Only add tail if last message is from assistant (and not empty)
      const needsTail = lastMsg && lastMsg.role === 'assistant' && String(lastMsg.content || '').trim();
      const tail = needsTail ? 'Assistant:' : '';

      return [systemPrompt, userPrompt, tail].filter(Boolean).join('\n\n');
    }

    // Save to storage (via LRU cache)
    async save() {
      if (this.lruCache) {
        await this.lruCache.save(this.messages, this.tabId, this.url);
      } else {
        // Fallback: direct storage
        const key = this.getStorageKey();
        try {
          await chrome.storage.local.set({ [key]: this.messages });
        } catch (err) {
          console.error('[ChatSession] Save error:', err);
        }
      }
    }

    // Load from storage (via LRU cache)
    async load() {
      if (this.lruCache) {
        this.messages = await this.lruCache.getOrBuild(this.tabId, this.url);
      } else {
        // Fallback: direct storage
        const key = this.getStorageKey();
        try {
          const result = await chrome.storage.local.get([key]);
          this.messages = result[key] || [];
        } catch (err) {
          console.error('[ChatSession] Load error:', err);
          this.messages = [];
        }
      }
      return this.messages;
    }

    // Clear all messages
    clear() {
      this.messages = [];
    }

    // Remove from storage
    async removeFromStorage() {
      const key = this.getStorageKey();
      try {
        await chrome.storage.local.remove([key]);
      } catch (err) {
        console.error('[ChatSession] Remove error:', err);
      }
    }

    // Get message count
    getMessageCount() {
      return this.messages.length;
    }

    // Export conversation
    export() {
      return {
        tabId: this.tabId,
        url: this.url,
        contextUrl: this.context.url,
        title: this.context.title,
        messages: this.messages,
        exportedAt: new Date().toISOString()
      };
    }
  }

  // Chat sessions manager (singleton pattern)
  class ChatSessionManager {
    constructor() {
      this.currentSession = null;
      // Create LRU cache with max 50 conversations
      this.lruCache = new window.ChatLRUCache({ maxSize: 50 });
    }

    /**
     * Get or create session for tabId + url.
     * Switches context if tabId/url changed.
     *
     * @param {number|string} tabId
     * @param {string} url
     * @returns {Promise<ChatSession>}
     */
    async getSession(tabId, url = '') {
      // Check if we need to switch context
      if (this.currentSession &&
          String(this.currentSession.tabId) === String(tabId) &&
          this.currentSession.url === url) {
        return this.currentSession;
      }

      // Save current session before switching to new one
      if (this.currentSession) {
        await this.currentSession.save();
      }

      // Create new session with LRU cache
      const session = new ChatSession(tabId, url, this.lruCache);
      await session.load();

      this.currentSession = session;
      return session;
    }

    /**
     * Switch to different tab/url context.
     *
     * @param {number|string} tabId
     * @param {string} url
     * @returns {Promise<ChatSession>}
     */
    async switchContext(tabId, url = '') {
      if (!this.currentSession) {
        return this.getSession(tabId, url);
      }

      // Save current before switching
      await this.currentSession.save();

      // Switch and load new context
      await this.currentSession.switchContext(tabId, url);
      return this.currentSession;
    }

    /**
     * Get current session.
     *
     * @returns {ChatSession|null}
     */
    getCurrentSession() {
      return this.currentSession;
    }

    /**
     * Remove session from LRU cache.
     *
     * @param {number|string} tabId
     * @param {string} url
     */
    removeSession(tabId, url = '') {
      const key = this.lruCache.makeKey(tabId, url);
      this.lruCache.delete(key);
    }

    /**
     * Clear all sessions.
     */
    async clearAllSessions() {
      await this.lruCache.clearAll();
      this.currentSession = null;
    }

    /**
     * Get all sessions info.
     */
    getAllSessions() {
      const entries = this.lruCache.entries();
      return entries.map(([key, messages]) => {
        // Parse key: clawside_chat_{tabId}_{urlHash}
        const parts = key.replace('clawside_chat_', '').split('_');
        const tabId = parts[0];
        return {
          key,
          tabId,
          messageCount: Array.isArray(messages) ? messages.length : 0
        };
      });
    }
  }

  // Expose to global scope
  window.ChatSession = ChatSession;
  window.chatSessionManager = new ChatSessionManager();

})();