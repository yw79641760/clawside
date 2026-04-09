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
 */
export function buildHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token && token.trim()) {
    headers['Authorization'] = 'Bearer ' + token.trim();
  }
  return headers;
}

/**
 * Build the common request body for chat completions.
 */
export function buildBody(prompt, model = 'openclaw', toolName = 'default', systemPrompt = '') {
  const messages = [];
  if (systemPrompt) { messages.push({ role: 'system', content: systemPrompt }); }
  messages.push({ role: 'user', content: prompt });
  return { model: model || 'openclaw', user: 'clawside:' + toolName, messages };
}

/**
 * Send a streaming chat completion request.
 */
export async function apiStream(prompt, systemPrompt, port, token, requestId, toolName = 'default', model = 'openclaw', sourceTabId = null) {
  const url = buildUrl(port);
  const headers = buildHeaders(token);
  const body = { ...buildBody(prompt, model, toolName, systemPrompt), stream: true };

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
 * Send a non-streaming chat completion request.
 */
export async function apiCall(prompt, systemPrompt, port, token, toolName = 'default', model = 'openclaw') {
  const url = buildUrl(port);
  const headers = buildHeaders(token);
  const body = { ...buildBody(prompt, model, toolName, systemPrompt), stream: false };

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Fetch available models from the gateway.
 */
export async function getModels(port, token, signal) {
  const url = buildUrl(port);
  const headers = buildHeaders(token);

  const response = await fetch(`${url}/v1/models`, { method: 'GET', headers, signal });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  if (!data?.data || !Array.isArray(data.data) || data.data.length === 0) {
    throw new Error('Invalid response: no models available');
  }

  return data.data;
}
