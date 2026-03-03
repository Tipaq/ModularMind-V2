# API Reference — Conversations & Messages

## Overview

The Conversations API manages chat sessions between users and agents. Messages within a conversation are ordered chronologically and support streaming responses via SSE (Server-Sent Events).

## Endpoints

### GET /conversations

List conversations for the authenticated user.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page (max 100) |
| `agent_id` | string | — | Filter by agent |
| `status` | string | — | Filter: `active`, `archived` |
| `search` | string | — | Search in title and messages |
| `sort` | string | `-updated_at` | Sort field (prefix `-` for desc) |

**Response (200):**
```json
{
  "items": [
    {
      "id": "conv_abc123",
      "title": "Debugging API timeout issue",
      "agent_id": "agt_support01",
      "agent_name": "Support Agent",
      "status": "active",
      "message_count": 12,
      "last_message_preview": "The timeout was caused by...",
      "created_at": "2026-02-28T14:30:00Z",
      "updated_at": "2026-03-01T09:15:00Z"
    }
  ],
  "total": 45,
  "page": 1,
  "per_page": 20,
  "pages": 3
}
```

### POST /conversations

Create a new conversation.

**Request:**
```json
{
  "agent_id": "agt_support01",
  "title": "Help with API integration",
  "metadata": {
    "source": "web",
    "priority": "normal"
  }
}
```

**Response (201):**
```json
{
  "id": "conv_def456",
  "title": "Help with API integration",
  "agent_id": "agt_support01",
  "agent_name": "Support Agent",
  "status": "active",
  "message_count": 0,
  "created_at": "2026-03-01T10:00:00Z",
  "updated_at": "2026-03-01T10:00:00Z"
}
```

### GET /conversations/{conversation_id}

Get a specific conversation with its full message history.

**Response (200):**
```json
{
  "id": "conv_abc123",
  "title": "Debugging API timeout issue",
  "agent_id": "agt_support01",
  "agent_name": "Support Agent",
  "status": "active",
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "My API calls are timing out after 30 seconds",
      "created_at": "2026-02-28T14:30:00Z"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "I understand you're experiencing API timeouts. Let me help you troubleshoot this...",
      "metadata": {
        "model": "gpt-4o",
        "tokens_in": 45,
        "tokens_out": 230,
        "latency_ms": 1850,
        "memory_used": true,
        "rag_sources": ["api-troubleshooting.md"]
      },
      "created_at": "2026-02-28T14:30:05Z"
    }
  ],
  "message_count": 12,
  "created_at": "2026-02-28T14:30:00Z",
  "updated_at": "2026-03-01T09:15:00Z"
}
```

### PATCH /conversations/{conversation_id}

Update conversation metadata.

**Request:**
```json
{
  "title": "API timeout - RESOLVED",
  "status": "archived"
}
```

### DELETE /conversations/{conversation_id}

Delete a conversation and all its messages. This action is irreversible.

**Response (204):** No content.

---

## Message Endpoints

### POST /conversations/{conversation_id}/messages

Send a message and receive the agent's response.

**Request:**
```json
{
  "content": "How do I configure rate limiting?",
  "attachments": []
}
```

**Response (200) — Non-streaming:**
```json
{
  "user_message": {
    "id": "msg_003",
    "role": "user",
    "content": "How do I configure rate limiting?",
    "created_at": "2026-03-01T10:05:00Z"
  },
  "assistant_message": {
    "id": "msg_004",
    "role": "assistant",
    "content": "Rate limiting in ModularMind can be configured at multiple levels...",
    "metadata": {
      "model": "gpt-4o-mini",
      "tokens_in": 1250,
      "tokens_out": 450,
      "latency_ms": 2100
    },
    "created_at": "2026-03-01T10:05:03Z"
  }
}
```

### GET /conversations/{conversation_id}/messages/stream

SSE streaming endpoint for real-time agent responses.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The user's message |
| `message_id` | string | No | Pre-generated message ID |

**SSE Event Types:**

```
event: message_start
data: {"message_id": "msg_004", "model": "gpt-4o"}

event: content_delta
data: {"delta": "Rate "}

event: content_delta
data: {"delta": "limiting "}

event: content_delta
data: {"delta": "in ModularMind..."}

event: tool_call
data: {"tool": "search_docs", "input": {"query": "rate limiting config"}}

event: tool_result
data: {"tool": "search_docs", "output": "Found 3 relevant sections..."}

event: rag_context
data: {"sources": [{"document": "guide-config.md", "chunk": "Rate limiting is configured via...","score": 0.92}]}

event: memory_recall
data: {"memories": [{"content": "User prefers YAML configuration", "score": 0.85}]}

event: message_end
data: {"message_id": "msg_004", "tokens_in": 1250, "tokens_out": 450, "latency_ms": 2100}

event: error
data: {"code": "model_overloaded", "message": "Model temporarily unavailable, retrying..."}
```

**Client Example (JavaScript):**
```javascript
const eventSource = new EventSource(
  `/conversations/${convId}/messages/stream?content=${encodeURIComponent(message)}`,
  { withCredentials: true }
);

eventSource.addEventListener('content_delta', (e) => {
  const { delta } = JSON.parse(e.data);
  appendToMessage(delta);
});

eventSource.addEventListener('message_end', (e) => {
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  console.error('SSE error:', e);
  eventSource.close();
});
```

## Message Metadata

Each assistant message includes metadata about its generation:

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | LLM model used |
| `tokens_in` | int | Input token count |
| `tokens_out` | int | Output token count |
| `latency_ms` | int | Total response time |
| `memory_used` | bool | Whether memory was consulted |
| `rag_sources` | string[] | Document filenames used as context |
| `tools_called` | string[] | MCP tools invoked during generation |
| `graph_id` | string | Graph workflow used (if applicable) |
| `cost_usd` | float | Estimated cost for cloud providers |

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `empty_message` | Message content is empty |
| 403 | `conversation_access_denied` | User doesn't own this conversation |
| 404 | `conversation_not_found` | Conversation ID doesn't exist |
| 404 | `agent_not_found` | Agent has been deleted or deactivated |
| 429 | `rate_limited` | Too many messages (default: 60/min) |
| 503 | `model_unavailable` | LLM provider is down, no fallback available |
