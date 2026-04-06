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
    addUserMessage(content, timestamp = null) {
      const msg = {
        role: 'user',
        content,
        timestamp: timestamp || Date.now()
      };
      this.messages.push(msg);
      return msg;
    }

    // Add assistant message (initially empty for streaming)
    addAssistantMessage(content = '', timestamp = null) {
      const msg = {
        role: 'assistant',
        content,
        timestamp: timestamp || Date.now()
      };
      this.messages.push(msg);
      return msg;
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
    // @param {boolean} includeFullContext - if true, include full page context (title + url + content) for first ask
    //                                       if false, include only title + url (for follow-up questions)
    // @param {boolean} includeHistory - if true, include full conversation history (default: false)
    buildPrompt(includeFullContext = true, extraSystemPrompt = '', includeHistory = false) {
      const systemPrompt = this.buildSystemPrompt(includeFullContext, extraSystemPrompt);

      // Only include the last user message (not full history) to reduce tokens
      // OpenClaw/Gateway has its own memory
      const lastMsg = this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
      let convo = '';

      if (includeHistory) {
        // Legacy: include full history for backward compatibility
        const msgsToInclude = (lastMsg && lastMsg.role === 'assistant' && !String(lastMsg.content || '').trim())
          ? this.messages.slice(0, -1)
          : this.messages;
        convo = msgsToInclude.map((msg) => {
          const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
          return `${roleLabel}: ${msg.content}`;
        }).join('\n\n');
      } else if (lastMsg && lastMsg.role === 'user') {
        // Only send the last user question + context
        convo = `User: ${lastMsg.content}`;
      }

      // Only add tail if last message is from assistant
      const needsTail = lastMsg && lastMsg.role === 'assistant';
      const tail = needsTail ? 'Assistant:' : '';

      return [systemPrompt, convo, tail].filter(Boolean).join('\n\n');
    }

    // Build system prompt with page context
    // @param {boolean} includeFullContext - if true, include title + url + content; if false, only title + url
    buildSystemPrompt(includeFullContext = true, extraSystemPrompt = '') {
      const parts = [];

      parts.push([
        'You are a helpful assistant for webpage Q&A.',
        'Follow the user question and use the provided page context.',
        'If selected text is present, prefer it over the full content.',
        'If the answer cannot be found in the provided context, say so explicitly and explain what is missing.',
        'Respond in Markdown.',
        'Be concise: prefer 3-8 bullet points or short paragraphs.'
      ].join('\n'));

      if (this.context.title || this.context.url) {
        const contextInfo = [
          'Current page:',
          this.context.title ? `- Title: ${this.context.title}` : null,
          this.context.url ? `- URL: ${this.context.url}` : null
        ].filter(Boolean).join('\n');
        parts.push(contextInfo);
      }

      if (this.context.selectedText && String(this.context.selectedText).trim()) {
        parts.push('User-selected text from the page (prioritize this when relevant):\n'
          + `"${String(this.context.selectedText).trim()}"`);
      }

      // Only include page content for first ask (includeFullContext=true)
      // Skip for follow-up questions to save tokens
      if (includeFullContext) {
        var body = this.context.content && String(this.context.content).trim()
          ? String(this.context.content).trim()
          : '';
        if (body) {
          var truncated = body.length > ASK_PAGE_CONTENT_MAX
            ? body.slice(0, ASK_PAGE_CONTENT_MAX)
            : body;
          parts.push('Page main content (excerpt for this tab; may be partial):\n' + truncated
            + (body.length > ASK_PAGE_CONTENT_MAX
              ? '\n\n[Truncated — refresh context in the panel if you need more.]'
              : ''));
        }
      }

      const base = parts.join('\n\n');
      return extraSystemPrompt ? `${base}\n\n${extraSystemPrompt}` : base;
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