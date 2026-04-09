// ClawSide - OpenAI Compatible API Client
// Handles HTTP communication with local AI gateways (OpenClaw, Ollama, etc.).
// Supports both IIFE (via <script>) and ES Module import (background.js).

(function(root, factory) {
  'use strict';

  // UMD pattern: works in browser (IIFE), CommonJS, and AMD
  if (typeof module === 'object' && module.exports) {
    // CommonJS
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define(factory);
  } else {
    // Browser global
    root.openaiCompatible = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // ========== Internal Functions ==========

  function buildUrl(port) {
    return 'http://127.0.0.1:' + String(port || '18789');
  }

  function buildHeaders(token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token && token.trim()) {
      headers['Authorization'] = 'Bearer ' + token.trim();
    }
    return headers;
  }

  function buildBody(prompt, model, toolName, systemPrompt) {
    model = model || 'openclaw';
    toolName = toolName || 'default';
    var messages = [];
    if (systemPrompt) { messages.push({ role: 'system', content: systemPrompt }); }
    messages.push({ role: 'user', content: prompt });
    return { model: model, user: 'clawside:' + toolName, messages: messages };
  }

  // ========== API Functions ==========

  async function apiStream(prompt, systemPrompt, port, token, requestId, toolName, model, sourceTabId) {
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
      throw new Error('HTTP ' + response.status + ': ' + await response.text());
    }

    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

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

  async function apiCall(prompt, systemPrompt, port, token, toolName, model) {
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
      throw new Error('HTTP ' + response.status + ': ' + await response.text());
    }

    var data = await response.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
  }

  async function getModels(port, token) {
    var url = buildUrl(port);
    var headers = buildHeaders(token);

    var response = await fetch(url + '/v1/models', {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + await response.text());
    }

    var data = await response.json();
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error('Invalid response: no models available');
    }
    return data.data;
  }

  // ========== Export ==========

  // For ES Module import: export all
  var api = {
    apiStream: apiStream,
    apiCall: apiCall,
    buildUrl: buildUrl,
    buildHeaders: buildHeaders,
    buildBody: buildBody,
    getModels: getModels
  };

  // For IIFE: also expose to window (for content scripts / side panel)
  if (typeof window !== 'undefined') {
    window.openaiCompatible = api;
    // Also expose individual functions for convenience
    window.getModels = getModels;
  }

  return api;
}));
