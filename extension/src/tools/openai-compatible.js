// ClawSide - OpenAI Compatible API Client
// Handles HTTP communication with local AI gateways (OpenClaw, Ollama, etc.).
// Supports OpenAI-compatible APIs including streaming and auth.

(function(root, factory) {
  'use strict';

  // Detect ES Module environment (background with type: module)
  if (typeof module === 'object' && module.exports) {
    // CommonJS / Node environment
    module.exports = factory();
  } else if (typeof root.define === 'function' && root.define.amd) {
    // AMD
    define([], factory);
  } else {
    // Browser global (IIFE loaded via <script>)
    factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  /**
   * Build the base URL for the OpenClaw gateway.
   */
  function buildUrl(port) {
    return 'http://127.0.0.1:' + String(port || '18789');
  }

  /**
   * Build request headers for the OpenClaw gateway.
   * Supports token and password authentication modes.
   * @see https://docs.openclaw.ai/gateway/openai-http-api#authentication
   */
  function buildHeaders(token) {
    var headers = {
      'Content-Type': 'application/json',
    };
    // Token authentication: Bearer token
    if (token && token.trim()) {
      headers['Authorization'] = 'Bearer ' + token.trim();
    }
    return headers;
  }

  /**
   * Build the common request body for chat completions.
   */
  function buildBody(prompt, model, toolName, systemPrompt) {
    model = model || 'openclaw';
    toolName = toolName || 'default';
    var messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return {
      model: model,
      user: 'clawside:' + toolName,
      messages: messages
    };
  }

  /**
   * Send a streaming chat completion request.
   */
  async function apiStream(prompt, systemPrompt, port, token, requestId, toolName, model, sourceTabId) {
    if (!toolName) toolName = 'default';
    if (!model) model = 'openclaw';

    var url = buildUrl(port);
    var headers = buildHeaders(token);
    var body = buildBody(prompt, model, toolName, systemPrompt);
    body.stream = true;

    var response = await fetch(url + '/v1/chat/completions', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      var errorText = await response.text();
      throw new Error('HTTP ' + response.status + ': ' + errorText);
    }

    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    // Send message back to extension
    var sendMsg = function(msg) {
      if (sourceTabId) {
        return chrome.tabs.sendMessage(sourceTabId, msg)
          .catch(function() { return chrome.runtime.sendMessage(msg).catch(function() {}); });
      }
      return chrome.runtime.sendMessage(msg).catch(function() {});
    };

    while (true) {
      var result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith('data: ')) continue;
        var data = line.slice(6).trim();
        if (data === '[DONE]') {
          sendMsg({ type: 'clawside-stream-done', requestId: requestId });
          return;
        }
        try {
          var json = JSON.parse(data);
          var content = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content || '';
          if (content) {
            sendMsg({ type: 'clawside-stream-chunk', requestId: requestId, chunk: content });
          }
        } catch (e) {}
      }
    }
    sendMsg({ type: 'clawside-stream-done', requestId: requestId });
  }

  /**
   * Send a non-streaming chat completion request.
   */
  async function apiCall(prompt, systemPrompt, port, token, toolName, model) {
    if (!toolName) toolName = 'default';
    if (!model) model = 'openclaw';

    var url = buildUrl(port);
    var headers = buildHeaders(token);
    var body = buildBody(prompt, model, toolName, systemPrompt);
    body.stream = false;

    var response = await fetch(url + '/v1/chat/completions', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      var errorText = await response.text();
      throw new Error('HTTP ' + response.status + ': ' + errorText);
    }

    var data = await response.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
  }

  /**
   * Fetch available models from the gateway.
   */
  async function getModels(port, token) {
    var url = buildUrl(port);
    var headers = buildHeaders(token);

    var response = await fetch(url + '/v1/models', {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      var errorText = await response.text();
      throw new Error('HTTP ' + response.status + ': ' + errorText);
    }

    var data = await response.json();
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error('Invalid response: no models available');
    }

    return data.data;
  }

  // Expose for content scripts and side panel (global)
  if (typeof window !== 'undefined') {
    window.getModels = getModels;
    window.buildUrl = buildUrl;
    window.buildHeaders = buildHeaders;
    window.buildBody = buildBody;
  }

  // Return API for ES Module import (background.js)
  return {
    apiStream: apiStream,
    apiCall: apiCall,
    buildUrl: buildUrl,
    buildHeaders: buildHeaders,
    buildBody: buildBody,
    getModels: getModels
  };
}));
