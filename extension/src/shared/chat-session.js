// ClawSide - Chat Session Manager
// Manages multi-turn conversation history per tab
// Storage key: clawside_chat_{tabId}

(function() {
  'use strict';

  // Max chars of page body injected into Ask system prompt (TCM often caps at ~10k).
  var ASK_PAGE_CONTENT_MAX = 12000;

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

    // Build API request prompt (plain text) for better LLM adherence.
    buildPrompt(includeContext = true, extraSystemPrompt = '') {
      const systemPrompt = includeContext ? this.buildSystemPrompt(extraSystemPrompt) : '';

      // If the last assistant message is an empty streaming placeholder,
      // omit it and ask the model to produce the next assistant answer.
      const lastMsg = this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
      const msgsToInclude = (lastMsg && lastMsg.role === 'assistant' && !String(lastMsg.content || '').trim())
        ? this.messages.slice(0, -1)
        : this.messages;

      const convo = msgsToInclude.map((msg) => {
        const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
        return `${roleLabel}: ${msg.content}`;
      }).join('\n\n');

      // Let the model know it should answer next.
      const tail = 'Assistant:';
      return [systemPrompt, convo, tail].filter(Boolean).join('\n\n');
    }

    // Build system prompt with page context
    buildSystemPrompt(extraSystemPrompt = '') {
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

      const base = parts.join('\n\n');
      return extraSystemPrompt ? `${base}\n\n${extraSystemPrompt}` : base;
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
