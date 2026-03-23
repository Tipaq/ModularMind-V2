# ADR-001: Redis Streams vs Celery for Background Processing

## Status

**Accepted** — 2025-07-15

## Context

ModularMind requires a robust background processing system for several workloads:

- Document processing (chunking, embedding, indexing) for the RAG pipeline
- Memory extraction (LLM-based fact extraction from conversations)
- Memory embedding and consolidation
- Scheduled tasks (model health checks, cache cleanup, metric reporting)

We need a solution that handles both event-driven stream processing and scheduled tasks reliably.

## Decision Drivers

1. **Operational simplicity**: Minimize the number of infrastructure components
2. **Reliability**: At-least-once delivery with consumer groups
3. **Observability**: Easy monitoring of queue depth and processing latency
4. **Developer experience**: Simple API, easy debugging
5. **Performance**: Handle bursts of document uploads without backpressure issues

## Options Considered

### Option A: Celery + RabbitMQ/Redis

**Pros:**
- Industry standard for Python task queues
- Rich ecosystem (beat scheduler, flower monitoring, result backends)
- Built-in retry mechanisms, rate limiting, priority queues
- Well-documented with extensive community support

**Cons:**
- Heavy dependency footprint (Celery + kombu + billiard + vine)
- Complex configuration (worker concurrency, prefetch multiplier, acks_late)
- RabbitMQ adds another infrastructure component
- Serialization issues with complex objects
- Difficult to debug worker processes (forked processes, signal handling)
- Flower monitoring tool has known security issues

### Option B: Redis Streams + Custom Consumer

**Pros:**
- Redis is already required for caching and session management
- No additional infrastructure needed
- Native consumer groups with at-least-once delivery
- Simple XADD/XREADGROUP API
- Transparent message format (key-value pairs)
- Easy to monitor via Redis CLI or any Redis GUI
- Dead Letter Queue (DLQ) pattern is straightforward

**Cons:**
- No built-in scheduler (need APScheduler or similar)
- Manual implementation of retry logic
- No built-in result backend
- Less ecosystem tooling compared to Celery

### Option C: asyncio + in-process background tasks

**Pros:**
- Zero additional dependencies
- Simplest to implement
- No serialization overhead

**Cons:**
- No persistence (tasks lost on crash)
- No horizontal scaling
- No consumer groups or load balancing
- Not suitable for production workloads

## Decision

**We chose Option B: Redis Streams with a custom consumer (`RedisStreamBus`).**

The key factor was operational simplicity. Redis is already a required dependency for caching and rate limiting. Adding Celery would introduce 4+ new Python packages and potentially RabbitMQ as another infrastructure component. Redis Streams provides all the message queue semantics we need (consumer groups, acknowledgment, blocking reads) with zero additional infrastructure.

For scheduled tasks, we pair Redis Streams with APScheduler, which runs in the same worker process. This gives us cron-like scheduling without a separate beat process.

## Implementation

### Architecture

```
Engine API ──XADD──→ Redis Stream ──XREADGROUP──→ Worker Consumer
                         │                           │
                    (persistent)              (consumer group)
                         │                           │
                    tasks:documents            Process + XACK
                    tasks:models
                    memory:raw
                    memory:extracted
```

### Stream Names

| Stream | Purpose | Consumer Group |
|--------|---------|---------------|
| `tasks:documents` | RAG document processing | `doc_processors` |
| `tasks:models` | Model management tasks | `model_workers` |
| `memory:raw` | Raw memory extraction input | `mem_extractors` |
| `memory:extracted` | Extracted facts for embedding | `mem_embedders` |

### RedisStreamBus API

```python
bus = RedisStreamBus(redis_url="redis://localhost:6379/0")

# Publish
await bus.publish("tasks:documents", {
    "document_id": doc_id,
    "collection_id": col_id,
    "file_path": tmp_path,
})

# Consumer registration
bus.subscribe("tasks:documents", handler=document_process_handler)
await bus.start_consumers()
```

## Consequences

### Positive
- One fewer infrastructure component to manage
- Worker startup time reduced from ~5s (Celery) to ~0.5s
- Simpler deployment (single worker process handles streams + scheduler)
- Easier debugging (no forked processes, standard async/await)

### Negative
- Must implement retry logic manually (implemented via DLQ pattern)
- No built-in monitoring UI (mitigated by custom Prometheus metrics)
- Team needs to learn Redis Streams API (low learning curve)

### Risks
- Redis memory pressure under high document upload bursts → Mitigated by stream trimming (MAXLEN)
- Single worker process is a SPOF → Mitigated by consumer groups (can scale to N workers)

## References

- [Redis Streams documentation](https://redis.io/docs/data-types/streams/)
- [Redis Streams consumer groups](https://redis.io/docs/data-types/streams-tutorial/)
- [APScheduler documentation](https://apscheduler.readthedocs.io/)
