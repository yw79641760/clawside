// ClawSide - OpenClaw Gateway Client
// Handles all HTTP communication with the OpenClaw local gateway.

/**
 * Build the base URL for the OpenClaw gateway.
 */
export function buildUrl(port) {
  return `http://127.0.0.1:${String(port || '18789')}`;
}

/**
 * Build request headers for the OpenClaw gateway.
 */
export function buildHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + String(token || '').trim()
  };
}

/**
 * Build the common request body for chat completions.
 */
export function buildBody(prompt, toolName = 'default') {
  return {
    model: 'openclaw/main',
    user: 'clawside:' + toolName,
    messages: [{ role: 'user', content: prompt }]
  };
}

// === Streaming API Call ===
/**
 * Send a streaming chat completion request.
 * Chunks are dispatched via chrome.runtime.sendMessage as 'clawside-stream-chunk'.
 * On completion, 'clawside-stream-done' is sent.
 * On error, 'clawside-stream-error' is sent.
 *
 * @param {string}   prompt
 * @param {string}   port
 * @param {string}   token
 * @param {string}   requestId
 * @param {string}   toolName
 * @returns {Promise<void>}
 */
export async function apiStream(prompt, port, token, requestId, toolName = 'default') {
  const url = buildUrl(port);
  const headers = buildHeaders(token);
  const body = {
    ...buildBody(prompt, toolName),
    stream: true
  };

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
        chrome.runtime.sendMessage({ type: 'clawside-stream-done', requestId }).catch(() => {});
        return;
      }
      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content || '';
        if (content) {
          chrome.runtime.sendMessage({ type: 'clawside-stream-chunk', requestId, content }).catch(() => {});
        }
      } catch {}
    }
  }
  chrome.runtime.sendMessage({ type: 'clawside-stream-done', requestId }).catch(() => {});
}

// === Non-streaming API Call (response sent via message) ===
/**
 * Send a non-streaming chat completion request.
 * Result is dispatched via 'clawside-api-result'.
 * Errors are dispatched via 'clawside-api-error'.
 *
 * @param {string}   prompt
 * @param {string}   port
 * @param {string}   token
 * @param {string}   requestId
 * @param {string}   toolName
 * @returns {Promise<void>}
 */
export async function apiNonStream(prompt, port, token, requestId, toolName = 'default') {
  const url = buildUrl(port);
  const headers = buildHeaders(token);
  const body = {
    ...buildBody(prompt, toolName),
    stream: false
  };

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const result = data.choices?.[0]?.message?.content?.trim() || '';
  chrome.runtime.sendMessage({ type: 'clawside-api-result', requestId, result }).catch(() => {});
}

// === Non-streaming API Call (returns promise) ===
/**
 * Send a non-streaming chat completion request and return the result directly.
 *
 * @param {string}   prompt
 * @param {string}   port
 * @param {string}   token
 * @param {string}   toolName
 * @returns {Promise<string>}
 */
export async function apiCall(prompt, port, token, toolName = 'default') {
  const url = buildUrl(port);
  const headers = buildHeaders(token);
  const body = buildBody(prompt, toolName);

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// === Connection Test ===
/**
 * Test connectivity to the OpenClaw gateway.
 * Sends a minimal non-streaming request to verify the endpoint is reachable.
 *
 * @param {string} port
 * @param {string} token
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function testConnection(port, token) {
  try {
    await apiCall('hi', port, token, 'test');
    return { ok: true, message: 'Connected' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
