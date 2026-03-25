/**
 * ClawSide Bridge Server
 *
 * Receives HTTP requests from Chrome extension and forwards them to OpenClaw
 * Gateway via its HTTP /v1/chat/completions endpoint.
 *
 * Usage:
 *   GATEWAY_TOKEN=your_token node bridge.js
 * Default port: 18792
 */

import { createServer } from 'http';

const PORT = process.env.PORT || 18792;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

// === HTTP helper ===
async function gatewayChat(prompt, model = 'main') {
  const url = `${GATEWAY_URL}/v1/chat/completions`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// === HTTP Server ===
const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    let data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    try {
      let result;

      if (req.url === '/translate') {
        const { text, targetLang = 'Chinese' } = data;
        if (!text) throw new Error('text is required');

        const prompt = `You are a professional translator. Translate the following text to ${targetLang}. Only output the translation, nothing else. Be accurate and natural.\n\nText: ${text}`;
        const response = await gatewayChat(prompt);
        result = { result: response };

      } else if (req.url === '/summarize') {
        const { url } = data;
        if (!url) throw new Error('url is required');

        const prompt = `You are a page summarizer. Summarize the content at the following URL in 3-5 clear sentences. Focus on the main points and key information. Only output the summary, nothing else.\n\nURL: ${url}`;
        const response = await gatewayChat(prompt);
        result = { summary: response };

      } else if (req.url === '/health') {
        result = { ok: true };

      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown endpoint' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } catch (err) {
      console.error('[Bridge] Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

// === Startup ===
async function main() {
  console.log('[ClawSide Bridge] Starting...');
  console.log(`[ClawSide Bridge] Gateway: ${GATEWAY_URL}`);
  console.log(`[ClawSide Bridge] Token: ${GATEWAY_TOKEN ? '***' + GATEWAY_TOKEN.slice(-4) : 'NOT SET'}`);

  // Quick health check
  try {
    const response = await fetch(`${GATEWAY_URL}/v1/models`, {
      headers: { 'Authorization': `Bearer ${GATEWAY_TOKEN}` }
    });
    console.log(`[ClawSide Bridge] Gateway health: ${response.status}`);
  } catch (err) {
    console.warn('[ClawSide Bridge] Warning: Cannot reach gateway:', err.message);
  }

  server.listen(PORT, () => {
    console.log(`[ClawSide Bridge] Listening on http://localhost:${PORT}`);
    console.log('[ClawSide Bridge] Ready to accept requests from Chrome extension');
  });
}

main();
