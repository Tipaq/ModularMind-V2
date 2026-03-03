# Guide Monitoring — Grafana & Alerting

## Dashboard Overview

ModularMind uses Prometheus for metrics collection and Grafana for visualization and alerting. The monitoring stack runs alongside the application in Docker Compose.

## Accessing Grafana

- **URL**: `https://grafana.modularmind.internal` (production) or `http://localhost:3001` (dev)
- **Default credentials**: `admin` / set via `GRAFANA_ADMIN_PASSWORD` env var
- **SSO**: Connected to company OIDC provider in production

## Key Dashboards

### 1. API Overview Dashboard

**Panels:**
- Request rate (req/s) by endpoint
- Latency percentiles (P50, P95, P99)
- Error rate (4xx, 5xx) by endpoint
- Active connections
- Response size distribution

**Key Queries:**
```promql
# Request rate by endpoint
rate(http_requests_total{job="engine"}[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="engine"}[5m]))

# Error rate percentage
100 * rate(http_requests_total{job="engine", status=~"5.."}[5m]) / rate(http_requests_total{job="engine"}[5m])
```

### 2. LLM Provider Dashboard

**Panels:**
- Token consumption by provider/model (counter)
- Request latency by provider (histogram)
- Error rate by provider
- Cost estimation (tokens * price per token)
- Fallback trigger rate

**Key Queries:**
```promql
# Tokens consumed per minute by provider
rate(llm_tokens_total{job="engine"}[5m]) * 60

# Estimated cost per hour (USD)
rate(llm_tokens_total{direction="output", provider="openai", model="gpt-4o"}[1h]) * 0.00001
+ rate(llm_tokens_total{direction="input", provider="openai", model="gpt-4o"}[1h]) * 0.0000025
```

### 3. Redis Streams Dashboard

**Panels:**
- Stream length (pending messages) per stream
- Consumer group lag
- Messages processed per minute
- Processing duration by stream
- Dead Letter Queue size

### 4. Qdrant Dashboard

**Panels:**
- Search latency (P50, P95)
- Points count per collection
- Memory usage
- Upsert rate

### 5. Memory System Dashboard

**Panels:**
- Memories created per hour
- Memories by scope and tier
- Consolidation runs and duration
- Memory search latency
- Graph edges created

## Alert Rules

### Critical Alerts (P1 — PagerDuty)

| Alert | Condition | Duration |
|-------|-----------|----------|
| API Down | `up{job="engine"} == 0` | 1 minute |
| High Error Rate | Error rate > 5% | 5 minutes |
| Database Unreachable | `pg_up == 0` | 1 minute |
| Redis Unreachable | `redis_up == 0` | 1 minute |
| Qdrant Unreachable | `qdrant_up == 0` | 1 minute |

### Warning Alerts (P2 — Slack)

| Alert | Condition | Duration |
|-------|-----------|----------|
| High Latency | P95 > 5 seconds | 10 minutes |
| Stream Lag | Any stream > 1000 pending | 15 minutes |
| High Memory | Container memory > 80% | 10 minutes |
| Disk Usage | > 85% disk used | 30 minutes |
| LLM Fallback | Fallback rate > 10% | 15 minutes |

### Info Alerts (P3 — Slack channel)

| Alert | Condition | Duration |
|-------|-----------|----------|
| High Token Usage | > 100K tokens/hour | 1 hour |
| Document Processing Slow | Processing > 5 min per doc | 30 minutes |
| Memory Consolidation Failed | Consolidation job error | Immediate |

## SLO / SLI Definitions

| Service | SLI | SLO Target |
|---------|-----|------------|
| API Availability | Successful responses / total requests | 99.9% |
| API Latency | P95 response time | < 2 seconds |
| Streaming Latency | Time to first token | < 1 second |
| Document Processing | Time from upload to ready | < 5 minutes |
| RAG Search | Search latency P95 | < 500ms |
| Memory Recall | Memory search latency P95 | < 200ms |

## Notification Channels

| Channel | Alerts | Integration |
|---------|--------|-------------|
| PagerDuty | P1 (Critical) | Via Grafana webhook |
| Slack #alerts-critical | P1 | Via Grafana webhook |
| Slack #alerts-warning | P2 | Via Grafana webhook |
| Slack #monitoring | P3 + daily digest | Via Grafana webhook |
| Email (management) | Weekly SLO report | Grafana scheduled report |