# Performance Metrics & Dashboards

## Key Performance Indicators

### API Performance

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Request rate | — | > 1000 req/s (capacity planning) |
| P50 latency | < 200ms | > 500ms |
| P95 latency | < 2s | > 5s |
| P99 latency | < 5s | > 10s |
| Error rate (5xx) | < 0.1% | > 1% |
| Error rate (4xx) | < 5% | > 10% |

### LLM Performance

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Time to first token (TTFT) | < 500ms | > 2s |
| Tokens per second (TPS) | > 30 tok/s | < 10 tok/s |
| Completion latency | < 5s | > 15s |
| Fallback rate | < 5% | > 15% |
| Cost per conversation | < $0.10 | > $0.50 |

### RAG Performance

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Search latency (P95) | < 500ms | > 1s |
| Recall@10 | > 85% | < 70% |
| Document processing time | < 5 min | > 15 min |
| Chunk count per collection | — | > 100K (perf warning) |

### Memory Performance

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Recall latency (P95) | < 200ms | > 500ms |
| Extraction latency | < 5s | > 15s |
| Consolidation duration | < 30s | > 5 min |

## Prometheus Exporters

### Engine Metrics (FastAPI)

```python
# Custom metrics defined in engine
from prometheus_client import Counter, Histogram, Gauge

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"]
)

http_request_duration = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration",
    ["method", "path"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
)

llm_tokens_total = Counter(
    "llm_tokens_total",
    "Total LLM tokens",
    ["provider", "model", "direction"]  # direction: input/output
)

rag_search_duration = Histogram(
    "rag_search_duration_seconds",
    "RAG search duration",
    ["collection", "search_mode"]
)

active_sse_connections = Gauge(
    "active_sse_connections",
    "Active SSE streaming connections"
)
```

### Redis Metrics

Exported via redis-exporter sidecar:
- `redis_memory_used_bytes`
- `redis_connected_clients`
- `redis_stream_length{stream}`
- `redis_stream_groups_consumers{stream, group}`

### Qdrant Metrics

Collected via Qdrant's built-in `/telemetry` endpoint:
- Collection point count
- Search latency percentiles
- Memory usage
- Disk usage

## Grafana Dashboard Configuration

### Dashboard JSON Import

Pre-built dashboards are stored in `docker/grafana/dashboards/`:
- `api-overview.json`
- `llm-providers.json`
- `redis-streams.json`
- `qdrant.json`
- `memory-system.json`

### Data Sources

| Source | Type | URL |
|--------|------|-----|
| Prometheus | prometheus | http://prometheus:9090 |
| PostgreSQL | postgres | postgresql://grafana_readonly@db:5432/modularmind |
| Redis | redis-datasource | redis://redis:6379 |