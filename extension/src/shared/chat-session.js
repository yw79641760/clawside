// ClawSide - Chat Session Manager
// Manages multi-turn conversation history per tab
// Storage key: clawside_chat_{tabId}

(function() {
  'use strict';

  class ChatSession {
    constructor(tabId) {
      this.tabId = tabId;
      this.storageKey = `clawside_chat_${tabId}`;
      this.messages = [];
      this.context = {
        url: '',
        title: '',
        content: '',
        selectedText: ''
      };
    }

    // Set page context for the conversation
    setContext({ url, title, content, selectedText }) {
      this.context = { url, title, content, selectedText };
    }

    // Add user message
    addUserMessage(content) {
      const msg = {
        role: 'user',
        content,
        timestamp: Date.now()
      };
      this.messages.push(msg);
      return msg;
    }

    // Add assistant message (initially empty for streaming)
    addAssistantMessage(content = '') {
      const msg = {
        role: 'assistant',
        content,
        timestamp: Date.now()
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

    // Build API request format
    buildPrompt(includeContext = true) {
      const systemPrompt = this.buildSystemPrompt();
      const messages = [];
      
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      
      this.messages.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
      
      return messages;
    }

    // Build system prompt with page context
    buildSystemPrompt() {
      const parts = [];
      
      if (this.context.title || this.context.url) {
        let contextInfo = 'Current page context:\n';
        if (this.context.title) contextInfo += `- Title: ${this.context.title}\n`;
        if (this.context.url) contextInfo += `- URL: ${this.context.url}\n`;
        parts.push(contextInfo);
      }
      
      if (this.context.selectedText) {
        parts.push(`\nSelected text from page:\n"${this.context.selectedText}"`);
      }
      
      if (this.context.content) {
        parts.push(`\nPage content excerpt:\n${this.context.content.substring(0, 2000)}...`);
      }
      
      return parts.length > 0 ? parts.join('\n') + '\n\nPlease answer in the same language as the user\'s question.' : '';
    }

    // Save to storage
    async save() {
      try {
        await chrome.storage.local.set({ [this.storageKey]: this.messages });
      } catch (err) {
        console.error('[ChatSession] Save error:', err);
      }
    }

    // Load from storage
    async load() {
      try {
        const result = await chrome.storage.local.get([this.storageKey]);
        this.messages = result[this.storageKey] || [];
        return this.messages;
      } catch (err) {
        console.error('[ChatSession] Load error:', err);
        this.messages = [];
        return [];
      }
    }

    // Clear all messages
    clear() {
      this.messages = [];
    }

    // Remove from storage
    async removeFromStorage() {
      try {
        await chrome.storage.local.remove([this.storageKey]);
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
        url: this.context.url,
        title: this.context.title,
        messages: this.messages,
        exportedAt: new Date().toISOString()
      };
    }
  }

  // Chat sessions manager (singleton pattern)
  class ChatSessionManager {
    constructor() {
      this.sessions = new Map();
    }

    getSession(tabId) {
      if (!this.sessions.has(tabId)) {
        this.sessions.set(tabId, new ChatSession(tabId));
      }
      return this.sessions.get(tabId);
    }

    async removeSession(tabId) {
      const session = this.sessions.get(tabId);
      if (session) {
        await session.removeFromStorage();
        this.sessions.delete(tabId);
      }
    }

    async clearAllSessions() {
      const keys = await chrome.storage.local.get(null);
      const chatKeys = Object.keys(keys).filter(k => k.startsWith('clawside_chat_'));
      if (chatKeys.length > 0) {
        await chrome.storage.local.remove(chatKeys);
      }
      this.sessions.clear();
    }

    getAllSessions() {
      return Array.from(this.sessions.entries()).map(([tabId, session]) => ({
        tabId,
        messageCount: session.getMessageCount(),
        context: session.context
      }));
    }
  }

  // Expose to global scope
  window.ChatSession = ChatSession;
  window.chatSessionManager = new ChatSessionManager();

})();
