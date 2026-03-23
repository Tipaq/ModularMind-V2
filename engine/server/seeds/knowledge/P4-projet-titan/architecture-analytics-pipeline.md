# Architecture Analytics Pipeline — Projet Titan

## Vue d'ensemble

Le pipeline analytics collecte les événements de l'Engine, les agrège dans TimescaleDB, et les expose via une API pour le dashboard Ops et les exports.

```
Engine (FastAPI)
    │
    ├── Middleware metrics (request duration, status codes)
    ├── LLM callback (tokens, latency, cost)
    ├── RAG events (search, upload, processing)
    └── Memory events (extraction, recall)
    │
    ↓ (async emit via Redis Streams)
    │
analytics:events (Redis Stream)
    │
    ↓ (Worker consumer)
    │
Analytics Collector
    │
    ├── Parse & validate event
    ├── Enrich (cost calculation, categorization)
    └── Batch insert → TimescaleDB
    │
    ↓ (continuous aggregates)
    │
TimescaleDB Hypertables
    │
    ├── raw_metrics (1 min granularity, 6 months retention)
    ├── metrics_1h (continuous aggregate, 1 year retention)
    ├── metrics_1d (continuous aggregate, 2 years retention)
    └── metrics_1m (continuous aggregate, unlimited)
    │
    ↓
    │
Analytics API ──→ Dashboard UI (Ops app)
Export Service ──→ PDF/CSV (scheduled or on-demand)
Anomaly Detector ──→ Alerts (Slack/PagerDuty)
```

## TimescaleDB Schema

### Hypertable Principale

```sql
-- Extension TimescaleDB (ajoutée au PostgreSQL existant)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Table de métriques brutes
CREATE TABLE analytics_events (
    time TIMESTAMPTZ NOT NULL,
    tenant_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    agent_id VARCHAR(100),
    model VARCHAR(50),
    user_id UUID,
    -- Métriques numériques
    tokens_input INT DEFAULT 0,
    tokens_output INT DEFAULT 0,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    latency_ms INT DEFAULT 0,
    -- Métriques de qualité
    quality_score DECIMAL(3, 2),
    satisfaction INT CHECK (satisfaction IN (-1, 0, 1)),
    -- Dimensions
    channel VARCHAR(20),
    status VARCHAR(20),
    error_code VARCHAR(50),
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- Convertir en hypertable (partitionné par temps, chunks de 1 jour)
SELECT create_hypertable('analytics_events', 'time', chunk_time_interval => INTERVAL '1 day');

-- Index pour les requêtes fréquentes
CREATE INDEX idx_events_tenant_time ON analytics_events (tenant_id, time DESC);
CREATE INDEX idx_events_type_time ON analytics_events (event_type, time DESC);
CREATE INDEX idx_events_agent_time ON analytics_events (agent_id, time DESC);
CREATE INDEX idx_events_model_time ON analytics_events (model, time DESC);
```

### Continuous Aggregates

```sql
-- Agrégat horaire
CREATE MATERIALIZED VIEW metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    tenant_id,
    event_type,
    agent_id,
    model,
    COUNT(*) AS event_count,
    SUM(tokens_input) AS total_tokens_input,
    SUM(tokens_output) AS total_tokens_output,
    SUM(cost_usd) AS total_cost_usd,
    AVG(latency_ms) AS avg_latency_ms,
    percentile_agg(latency_ms) AS latency_percentiles,
    AVG(quality_score) AS avg_quality_score,
    COUNT(*) FILTER (WHERE satisfaction = 1) AS thumbs_up,
    COUNT(*) FILTER (WHERE satisfaction = -1) AS thumbs_down,
    COUNT(*) FILTER (WHERE status = 'error') AS error_count
FROM analytics_events
GROUP BY bucket, tenant_id, event_type, agent_id, model
WITH NO DATA;

-- Refresh policy : rafraîchir toutes les heures, données de la dernière heure
SELECT add_continuous_aggregate_policy('metrics_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Agrégat journalier (basé sur l'horaire)
CREATE MATERIALIZED VIEW metrics_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', bucket) AS bucket,
    tenant_id,
    event_type,
    agent_id,
    model,
    SUM(event_count) AS event_count,
    SUM(total_tokens_input) AS total_tokens_input,
    SUM(total_tokens_output) AS total_tokens_output,
    SUM(total_cost_usd) AS total_cost_usd,
    AVG(avg_latency_ms) AS avg_latency_ms,
    SUM(thumbs_up) AS thumbs_up,
    SUM(thumbs_down) AS thumbs_down,
    SUM(error_count) AS error_count
FROM metrics_hourly
GROUP BY bucket, tenant_id, event_type, agent_id, model
WITH NO DATA;
```

### Retention Policies

```sql
-- Données brutes : 6 mois
SELECT add_retention_policy('analytics_events', INTERVAL '6 months');

-- Agrégats horaires : 1 an
SELECT add_retention_policy('metrics_hourly', INTERVAL '1 year');

-- Agrégats journaliers : 2 ans
SELECT add_retention_policy('metrics_daily', INTERVAL '2 years');

-- Compression des données brutes après 7 jours
ALTER TABLE analytics_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id, event_type',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('analytics_events', INTERVAL '7 days');
```

## Event Collection

### Middleware FastAPI

```python
from starlette.middleware.base import BaseHTTPMiddleware

class AnalyticsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = int((time.monotonic() - start) * 1000)

        await analytics_bus.emit({
            "event_type": "http_request",
            "tenant_id": request.state.tenant_id,
            "user_id": request.state.user_id,
            "latency_ms": duration_ms,
            "status": str(response.status_code),
            "metadata": {
                "method": request.method,
                "path": request.url.path,
            }
        })
        return response
```

### LLM Callback

```python
class AnalyticsLLMCallback:
    async def on_llm_end(self, response, **kwargs):
        usage = response.usage
        model = kwargs.get("model", "unknown")
        pricing = LLM_PRICING.get(model, {"input": 0, "output": 0})

        cost = (
            usage.prompt_tokens * pricing["input"] / 1_000_000
            + usage.completion_tokens * pricing["output"] / 1_000_000
        )

        await analytics_bus.emit({
            "event_type": "llm_call",
            "agent_id": kwargs.get("agent_id"),
            "model": model,
            "tokens_input": usage.prompt_tokens,
            "tokens_output": usage.completion_tokens,
            "cost_usd": cost,
            "latency_ms": kwargs.get("duration_ms", 0),
            "status": "success",
        })
```

## Analytics API

### GET /analytics/metrics

```python
# Query parameters
class MetricsQuery(BaseModel):
    start: datetime            # Start time
    end: datetime              # End time
    granularity: str = "1h"    # "1m", "1h", "1d", "1w", "1M"
    event_type: str | None     # Filter by event type
    agent_id: str | None       # Filter by agent
    model: str | None          # Filter by model
    group_by: list[str] = []   # Group by dimensions

# Response
{
    "data": [
        {
            "bucket": "2026-03-01T10:00:00Z",
            "event_count": 1250,
            "total_tokens": 485000,
            "total_cost_usd": 12.45,
            "avg_latency_ms": 245,
            "error_rate": 0.02
        }
    ],
    "summary": {
        "total_events": 28500,
        "total_cost_usd": 287.30,
        "avg_latency_ms": 230,
        "period": "2026-03-01 to 2026-03-31"
    }
}
```

### GET /analytics/cost-breakdown

```python
# Retourne la répartition des coûts par modèle/agent
{
    "period": "2026-03",
    "total_cost_usd": 1247.50,
    "by_model": [
        {"model": "gpt-4o", "cost": 890.00, "percentage": 71.3},
        {"model": "gpt-4o-mini", "cost": 245.50, "percentage": 19.7}
    ],
    "by_agent": [
        {"agent": "Support Bot", "cost": 520.00, "percentage": 41.7},
        {"agent": "Sales Bot", "cost": 380.00, "percentage": 30.5}
    ],
    "trend": {
        "vs_previous_month": "+12%",
        "projected_month_end": 1450.00
    }
}
```

## Anomaly Detection (Phase 3)

### IsolationForest Configuration

```python
from sklearn.ensemble import IsolationForest

detector = IsolationForest(
    n_estimators=100,
    contamination=0.05,  # 5% des données sont des anomalies
    random_state=42,
)

# Features utilisées
features = [
    "event_count_1h",       # Nombre d'événements par heure
    "error_rate_1h",        # Taux d'erreur par heure
    "avg_latency_ms_1h",   # Latence moyenne par heure
    "cost_usd_1h",         # Coût par heure
    "token_ratio",          # Ratio output/input tokens
]
```

### Alertes Automatiques

| Anomalie | Condition | Action |
|----------|-----------|--------|
| Spike d'erreurs | Error rate > 3x moyenne 7j | Slack + PagerDuty |
| Coûts anormaux | Coût horaire > 2x moyenne 30j | Slack + email admin |
| Latence élevée | P99 > 5x baseline | Slack |
| Drop de trafic | -50% vs même créneau semaine précédente | Slack |
| Quality drop | Score moyen < 0.6 pendant 4h | Slack + email product |
