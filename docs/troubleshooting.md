# ClawSide Troubleshooting

Tags: Tech
AI custom autofill: Guide to connect OpenClaw, Ollama, and Hermes-Agent APIs.
Published: April 9, 2026

# How to connect ClawSide🦞 to LLM/Agent🤖️

## OpenClaw

OpenClaw’s Gateway can serve a small OpenAI-compatible Chat Completions endpoint.This endpoint is **disabled by default.**

1. Stop openclaw gateway

```bash
openclaw gateway stop
```

1. To enable it, you maybe edit `~/.openclaw/openclaw.json` to enable `gateway.http.endpoints.chatCompletions.enabled` as `true` .

```json
{
	"gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "${YOUR_GATEWAY_AUTH_TOKEN}"
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

1. Rerun openclaw gateway

```bash
openclaw gateway start
```

Reference:

1. https://docs.openclaw.ai/gateway/openai-http-api

## Ollama

No authentication is required when accessing Ollama’s API locally via [`http://localhost:11434`](http://localhost:11434/). Ollama allows cross-origin requests from `127.0.0.1` and `0.0.0.0` by default. Additional origins can be configured with `OLLAMA_ORIGINS`.

For browser extensions, you’ll need to explicitly allow the extension’s origin pattern. Set `OLLAMA_ORIGINS` to include `chrome-extension://`*, `moz-extension://`*, and `safari-web-extension://*` if you wish to allow all browser extensions access, or specific extensions as needed:

```bash
# Allow all Chrome, Firefox, and Safari extensions
OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*,safari-web-extension://* ollama serve
```

or solve this problem more thoroughly

```bash
# Allow all origins
OLLAMA_ORIGINS=* ollama serve
```

Reference: 

1. https://docs.ollama.com/api/authentication
2. https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama

## Hermes-Agent

Enable hermes api server and allow chrome extension visiting are as follows:

1. Stop hermes gateway

```bash
hermes gateway stop
```

1. Edit `~/.hermes/.env` file and append these following lines behind.

```bash
# Enable Hermes HTTP Gateway
API_SERVER_ENABLED=true
# Set Gateway auth token
API_SERVER_KEY=123456
# Allow chrome extension visiting
GATEWAY_ALLOW_ALL_USERS=true
```

1. Rerun hermes gateway

```bash
hermes gateway start
```

Reference: 

1. https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server?_highlight=api_server#configuration
2. https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-internals?_highlight=gateway_allow_all_users#authorization