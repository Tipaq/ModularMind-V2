# Architecture — Communication inter-services

## Overview

ModularMind uses three communication patterns between its services: synchronous REST for client-server interactions, asynchronous Redis Streams for background processing, and event-driven pub/sub for real-time notifications.

## Communication Patterns

### 1. Synchronous REST (Client → Engine)

All client-facing communication uses standard HTTP REST:

```
Chat SPA  ──HTTP──→  Nginx  ──proxy_pass──→  Engine (FastAPI)
Ops SPA   ──HTTP──→  Nginx  ──proxy_pass──→  Engine (FastAPI)
Platform  ──HTTP──→  Engine API directly
```

**Conventions:**
- JSON request/response bodies
- Cookie-based authentication (HttpOnly JWT)
- Consistent error format: `{"detail": "...", "code": "...", "status": 4xx}`
- Rate limiting via Redis sliding window (per-user, per-IP)
- Request timeout: 30s for standard requests, 120s for streaming

### 2. Asynchronous Redis Streams (Engine → Worker)

Background tasks are published to Redis Streams and consumed by the Worker process:

```
Engine API ──XADD──→ Redis Stream ──XREADGROUP──→ Worker
                         │
                    Consumer Group
                    (at-least-once delivery)
```

**Stream Definitions:**

| Stream | Producer | Consumer | Purpose |
|--------|----------|----------|---------|
| `tasks:documents` | RAG router (upload) | `doc_processors` | Chunk + embed documents |
| `tasks:models` | Model service | `model_workers` | Download, validate models |
| `memory:raw` | Execution handler | `mem_extractors` | Extract facts from messages |
| `memory:extracted` | Fact extractor | `mem_embedders` | Embed and store memories |

**Message Format:**
```python
# Published as flat key-value pairs (Redis Streams requirement)
await bus.publish("tasks:documents", {
    "document_id": "doc_abc123",
    "collection_id": "col_docs",
    "file_path": "/tmp/uploads/doc_abc123.md",
    "filename": "guide.md",
    "chunk_size": "500",
    "chunk_overlap": "50",
})
```

**Error Handling:**
- Failed messages are moved to a Dead Letter Queue (DLQ): `{stream}:dlq`
- Maximum 3 retries with exponential backoff (1s, 5s, 25s)
- DLQ messages are reviewed manually via the Ops console
- Successful processing triggers XACK to acknowledge the message

### 3. Event-Driven (Platform ← Engine Polling)

The Engine periodically polls the Platform for configuration updates:

```
Engine (ConfigProvider) ──GET /api/sync/manifest──→ Platform
                        ←── {agents: v3, graphs: v2, ...}

Engine (ConfigProvider) ──GET /api/sync/agents──→ Platform (if version changed)
                        ←── [agent configs...]
```

**Sync Protocol:**
1. Engine sends `GET /api/sync/manifest` with `X-Engine-Key` header every 60 seconds
2. Platform responds with current version numbers for each config type
3. Engine compares with local versions
4. If versions differ, Engine fetches the updated configs
5. Configs are stored in the Engine's local PostgreSQL database
6. `ConfigProvider` serves configs from the local DB (no Platform dependency at runtime)

## Error Handling Strategies

### REST Errors

```python
# Standardized error responses
class AppError(Exception):
    def __init__(self, message: str, code: str, status: int = 400):
        self.message = message
        self.code = code
        self.status = status

# Global exception handler
@app.exception_handler(AppError)
async def app_error_handler(request, exc):
    return JSONResponse(
        status_code=exc.status,
        content={"detail": exc.message, "code": exc.code, "status": exc.status}
    )
```

### Stream Processing Errors

```python
async def process_with_retry(handler, data, max_retries=3):
    for attempt in range(max_retries):
        try:
            await handler(data)
            return  # Success
        except TransientError:
            backoff = 5 ** attempt  # 1s, 5s, 25s
            await asyncio.sleep(backoff)
        except PermanentError as e:
            await move_to_dlq(data, str(e))
            return
    await move_to_dlq(data, f"Max retries ({max_retries}) exceeded")
```

### Circuit Breaker Pattern

External service calls (LLM providers, Qdrant) use a circuit breaker:

```
CLOSED ──(failures > threshold)──→ OPEN ──(timeout elapsed)──→ HALF-OPEN
  ↑                                                                │
  └──────────────(success)────────────────────────────────────────┘
```

**Configuration:**
| Service | Failure Threshold | Reset Timeout | Half-Open Requests |
|---------|-------------------|---------------|-------------------|
| OpenAI | 5 failures | 30 seconds | 2 |
| Anthropic | 5 failures | 30 seconds | 2 |
| Ollama | 3 failures | 10 seconds | 1 |
| Qdrant | 3 failures | 15 seconds | 1 |

## Retry Strategies

| Scenario | Strategy | Max Retries | Backoff |
|----------|----------|-------------|---------|
| LLM API call | Exponential + jitter | 3 | 1s, 2s, 4s |
| Qdrant upsert | Fixed delay | 2 | 500ms |
| Redis publish | Immediate retry | 2 | 100ms |
| DB transaction | No retry (rollback) | 0 | — |
| Webhook delivery | Exponential | 3 | 5s, 30s, 5m |

## Observability

### Request Tracing

Every request gets a unique trace ID propagated across services:

```
X-Request-ID: req_abc123
```

This ID appears in:
- Engine API logs
- Worker task logs
- LLM provider call logs
- Qdrant query logs

### Metrics (Prometheus)

Key metrics exported by the Engine:

| Metric | Type | Labels |
|--------|------|--------|
| `http_requests_total` | Counter | method, path, status |
| `http_request_duration_seconds` | Histogram | method, path |
| `stream_messages_published` | Counter | stream |
| `stream_messages_processed` | Counter | stream, status |
| `stream_processing_duration_seconds` | Histogram | stream |
| `llm_requests_total` | Counter | provider, model, status |
| `llm_tokens_total` | Counter | provider, model, direction |
| `qdrant_queries_total` | Counter | collection, operation |
