---
title: Troubleshooting
layout: page
---

## How to connect ClawSide with LLM/Agent

### OpenClaw

OpenClaw's Gateway can serve a small OpenAI-compatible Chat Completions endpoint. This endpoint is **disabled by default.**

1. Stop openclaw gateway

```bash
openclaw gateway stop
```

2. To enable it, edit `~/.openclaw/openclaw.json` to enable `gateway.http.endpoints.chatCompletions.enabled` as `true`.

```json
{
	"gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "${YOUR...TOKEN}"
    },
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  }
}
```

3. Restart openclaw gateway

```bash
openclaw gateway start
```

Reference: [OpenClaw Gateway docs](https://docs.openclaw.ai/gateway/openai-http-api)

### Ollama

No authentication is required when accessing Ollama's API locally via `http://localhost:11434`. Ollama allows cross-origin requests from `127.0.0.1` and `0.0.0.0` by default.

For browser extensions, set `OLLAMA_ORIGINS` to include `chrome-extension://*`:

```bash
# Allow all Chrome extensions
OLLAMA_ORIGINS=chrome-extension://* ollama serve
```

References:
- [Ollama API Authentication](https://docs.ollama.com/api/authentication)
- [Ollama CORS FAQ](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama)

### Hermes-Agent

1. Stop hermes gateway

```bash
hermes gateway stop
```

2. Edit `~/.hermes/.env` and append:

```bash
# Enable Hermes HTTP Gateway
API_SERVER_ENABLED=true
# Set Gateway auth token
API_SERVER_KEY=123456
# Allow chrome extension visiting
GATEWAY_ALLOW_ALL_USERS=true
```

3. Restart hermes gateway

```bash
hermes gateway start
```

References:
- [Hermes-Agent API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- [Hermes-Agent Gateway Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-internals)
