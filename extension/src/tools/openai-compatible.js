// ClawSide - OpenAI Compatible API Client
// Handles HTTP communication with local AI gateways (OpenClaw, Ollama, etc.).
// Supports OpenAI-compatible APIs including streaming and auth.

/**
 * Build the base URL for the OpenClaw gateway.
 */
export function buildUrl(port) {
  return `http://127.0.0.1:${String(port || '18789')}`;
}

/**
 * Build request headers for the OpenClaw gateway.
 * Supports token and password authentication modes.
 * @see https://docs.openclaw.ai/gateway/openai-http-api#authentication
 */
export function buildHeaders(token) {
  const headers = {
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
 * @param {string} prompt - User prompt
 * @param {string} toolName - Tool identifier (default/summarize/translate/ask)
 * @param {string} systemPrompt - Optional system prompt
 * @returns {Object} Chat completion body
 * @see https://docs.openclaw.ai/gateway/openai-http-api#chat-completions
 */
export function buildBody(prompt, toolName = 'default', systemPrompt = '') {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });
  return {
    // Model routing: "openclaw" or "openclaw/<agentId>" for specific agent
    // Empty string defaults to "openclaw" (default agent)
    model: 'openclaw',
    // Session format: clawside:{toolName}
    // @see https://docs.openclaw.ai/gateway/openai-http-api#authentication
    user: 'clawside:' + toolName,
    messages
  };
}

/**
 * Send a streaming chat completion request.
 * Chunks are dispatched via chrome.runtime.sendMessage as 'clawside-stream-chunk'.
 * On completion, 'clawside-stream-done' is sent.
 * On error, 'clawside-stream-error' is sent.
 *
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @param {string} port - Gateway port
 * @param {string} token - Auth token
 * @param {string} requestId - Request identifier for response routing
 * @param {string} toolName - Tool identifier (default/summarize/translate/ask)
 * @param {number|null} sourceTabId - Tab ID for content script response routing
 * @returns {Promise<void>}
 */
export async function apiStream(prompt, systemPrompt, port, token, requestId, toolName = 'default', sourceTabId = null) {
  const url = buildUrl(port);
  const headers = buildHeaders(token);
  const body = {
    ...buildBody(prompt, toolName, systemPrompt),
    stream: true
  };

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Send message back to extension
  // For content scripts: use chrome.tabs.sendMessage with tab ID
  // For side panel: use chrome.runtime.sendMessage
  const sendMsg = (msg) => {
    if (sourceTabId) {
      return chrome.tabs.sendMessage(sourceTabId, msg)
        .catch(() => chrome.runtime.sendMessage(msg).catch(() => {}));
    }
    return chrome.runtime.sendMessage(msg).catch(() => {});
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        sendMsg({ type: 'clawside-stream-done', requestId });
        return;
      }
      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content || '';
        if (content) {
          sendMsg({ type: 'clawside-stream-chunk', requestId, chunk: content });
        }
      } catch {}
    }
  }
  sendMsg({ type: 'clawside-stream-done', requestId });
}

/**
 * Send a non-streaming chat completion request and return result directly.
 *
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @param {string} port - Gateway port
 * @param {string} token - Auth token
 * @param {string} toolName - Tool identifier
 * @param {string} requestId - Request identifier for response routing
 * @returns {Promise<string>} Assistant response
 */
export async function apiCall(prompt, systemPrompt, port, token, toolName = 'default', requestId = null) {
  const url = buildUrl(port);
  const headers = buildHeaders(token);
  const body = {
    ...buildBody(prompt, toolName, systemPrompt),
    stream: false
  };

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}