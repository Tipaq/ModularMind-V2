# API Reference — Webhooks & Callbacks

## Overview

ModularMind supports both outbound webhooks (notifying external systems of events) and inbound webhooks (receiving events from external systems). All webhooks are signed with HMAC-SHA256 for security.

## Outbound Webhooks

### Event Types

| Event | Trigger | Payload |
|-------|---------|---------|
| `conversation.created` | New conversation started | conversation object |
| `conversation.archived` | Conversation archived | conversation ID |
| `message.received` | User sends a message | message object |
| `message.responded` | Agent completes a response | message object + metadata |
| `agent.error` | Agent encounters an error | error details + context |
| `agent.fallback` | Agent falls back to secondary model | fallback details |
| `document.processed` | RAG document finished processing | document status |
| `document.failed` | RAG document processing failed | error details |
| `memory.consolidated` | Memory consolidation completed | consolidation log |
| `user.login` | User authenticates | user ID + timestamp |
| `system.health` | Health check status change | health report |

### Register a Webhook

**POST /webhooks**

```json
{
  "url": "https://your-api.com/modularmind-webhook",
  "events": ["message.responded", "agent.error"],
  "secret": "your_hmac_secret_min_32_chars",
  "headers": {
    "Authorization": "Bearer your-api-token"
  },
  "retry_policy": {
    "max_retries": 3,
    "backoff_seconds": [5, 30, 300]
  },
  "active": true
}
```

**Response (201):**
```json
{
  "id": "whk_abc123",
  "url": "https://your-api.com/modularmind-webhook",
  "events": ["message.responded", "agent.error"],
  "active": true,
  "created_at": "2026-03-01T10:00:00Z"
}
```

### Webhook Payload Format

All outbound webhooks follow this format:

```json
{
  "id": "evt_unique_id",
  "type": "message.responded",
  "timestamp": "2026-03-01T10:05:00Z",
  "data": {
    "conversation_id": "conv_abc123",
    "message_id": "msg_004",
    "agent_id": "agt_support01",
    "content": "Here's how to configure rate limiting...",
    "model": "gpt-4o-mini",
    "tokens_used": 580,
    "latency_ms": 2100
  }
}
```

### Signature Verification

Each webhook request includes a signature header:

```
X-ModularMind-Signature: sha256=a1b2c3d4e5f6...
X-ModularMind-Timestamp: 1709280300
```

**Verification (Python):**
```python
import hmac
import hashlib
import time

def verify_webhook(payload: bytes, signature: str, timestamp: str, secret: str) -> bool:
    # Prevent replay attacks (5 min window)
    if abs(time.time() - int(timestamp)) > 300:
        return False

    # Verify signature
    signed_payload = f"{timestamp}.{payload.decode()}".encode()
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

**Verification (Node.js):**
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, timestamp, secret) {
  const fiveMinutes = 300;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > fiveMinutes) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${expected}`),
    Buffer.from(signature)
  );
}
```

### Retry Policy

Failed webhook deliveries are retried with exponential backoff:

| Attempt | Delay | Total Wait |
|---------|-------|------------|
| 1st retry | 5 seconds | 5s |
| 2nd retry | 30 seconds | 35s |
| 3rd retry | 5 minutes | 5m 35s |

A webhook is considered failed if:
- HTTP status is not 2xx
- Connection timeout (10 seconds)
- DNS resolution fails

After all retries are exhausted, the event is logged and an alert is sent to admins.

### Manage Webhooks

**GET /webhooks** — List all registered webhooks

**GET /webhooks/{webhook_id}** — Get webhook details and delivery history

**PUT /webhooks/{webhook_id}** — Update webhook configuration

**DELETE /webhooks/{webhook_id}** — Remove a webhook

**POST /webhooks/{webhook_id}/test** — Send a test event

**GET /webhooks/{webhook_id}/deliveries** — View delivery history with status

```json
{
  "items": [
    {
      "id": "dlv_001",
      "event_type": "message.responded",
      "status": "delivered",
      "http_status": 200,
      "response_time_ms": 150,
      "attempts": 1,
      "delivered_at": "2026-03-01T10:05:01Z"
    },
    {
      "id": "dlv_002",
      "event_type": "agent.error",
      "status": "failed",
      "http_status": 503,
      "response_time_ms": 10000,
      "attempts": 4,
      "last_error": "Connection timeout after 3 retries",
      "failed_at": "2026-03-01T10:10:36Z"
    }
  ]
}
```

## Inbound Webhooks

### Create an Inbound Endpoint

**POST /webhooks/inbound**

```json
{
  "name": "Jira Ticket Events",
  "description": "Receives Jira ticket creation and update events",
  "agent_id": "agt_support01",
  "action": "create_conversation",
  "transform": {
    "content_template": "New Jira ticket: {{data.key}} - {{data.fields.summary}}\nPriority: {{data.fields.priority.name}}\nDescription: {{data.fields.description}}"
  }
}
```

**Response (201):**
```json
{
  "id": "iwh_abc123",
  "name": "Jira Ticket Events",
  "endpoint": "https://api.modularmind.io/webhooks/inbound/iwh_abc123",
  "secret": "auto_generated_secret_for_verification",
  "created_at": "2026-03-01T10:00:00Z"
}
```

### Receive Events

External systems send events to the generated endpoint:

```
POST /webhooks/inbound/{inbound_webhook_id}
Content-Type: application/json
X-Webhook-Signature: sha256=...

{
  "event": "ticket.created",
  "data": {
    "key": "PROJ-1234",
    "fields": {
      "summary": "Login page returns 500 error",
      "priority": { "name": "High" },
      "description": "Users cannot login since 10:00 AM..."
    }
  }
}
```

### Inbound Actions

| Action | Description |
|--------|-------------|
| `create_conversation` | Create a new conversation with the transformed content |
| `add_message` | Append a message to an existing conversation |
| `trigger_agent` | Invoke an agent with the payload as context |
| `log_event` | Log the event without agent interaction |

## Best Practices

1. **Always verify signatures** before processing webhook payloads
2. **Respond quickly** (< 5 seconds) to avoid timeout retries
3. **Process asynchronously** — acknowledge receipt and process in background
4. **Implement idempotency** using the event `id` to prevent duplicate processing
5. **Monitor delivery rates** via the webhook dashboard in Ops console
6. **Rotate secrets** every 90 days using the PUT endpoint
