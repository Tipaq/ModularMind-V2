"""Prometheus custom metrics for the runtime.

Provides execution-specific counters, gauges, and histograms
beyond what prometheus-fastapi-instrumentator auto-instruments.

Also handles metric snapshot storage in Redis sorted sets for
historical charts, and alert threshold evaluation.
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import UTC, datetime

import httpx
import psutil
from prometheus_client import Counter, Gauge, Histogram

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Execution metrics
# ---------------------------------------------------------------------------

executions_active = Gauge(
    "modularmind_executions_active",
    "Number of currently running executions",
)

executions_total = Counter(
    "modularmind_executions_total",
    "Total number of executions",
    ["status", "type"],
)

execution_duration_seconds = Histogram(
    "modularmind_execution_duration_seconds",
    "Execution duration in seconds",
    buckets=[1, 5, 10, 30, 60, 120, 300, 600],
)

# ---------------------------------------------------------------------------
# Stream queue metrics
# ---------------------------------------------------------------------------

stream_tasks_pending = Gauge(
    "modularmind_stream_tasks_pending",
    "Number of pending tasks in Redis Streams",
)

# ---------------------------------------------------------------------------
# Infrastructure metrics
# ---------------------------------------------------------------------------

db_pool_size = Gauge(
    "modularmind_db_pool_size",
    "Current database connection pool size",
)

redis_connections = Gauge(
    "modularmind_redis_connections",
    "Number of active Redis connections",
)

# ---------------------------------------------------------------------------
# LLM metrics
# ---------------------------------------------------------------------------

llm_request_duration_seconds = Histogram(
    "modularmind_llm_request_duration_seconds",
    "Duration of LLM API calls",
    ["provider", "model"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)

llm_ttft_seconds = Histogram(
    "modularmind_llm_ttft_seconds",
    "Time to first token",
    ["provider", "model"],
    buckets=[0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
)

llm_tokens_per_second = Histogram(
    "modularmind_llm_tokens_per_second",
    "Token generation throughput",
    ["provider", "model"],
    buckets=[1, 5, 10, 20, 50, 100, 200],
)

# ---------------------------------------------------------------------------
# GPU / VRAM metrics
# ---------------------------------------------------------------------------

vram_used_bytes = Gauge(
    "modularmind_vram_used_bytes",
    "VRAM currently used by loaded models",
)

vram_used_percent = Gauge(
    "modularmind_vram_used_percent",
    "VRAM usage percentage",
)

ollama_loaded_models = Gauge(
    "modularmind_ollama_loaded_models",
    "Number of models loaded in VRAM",
)

# ---------------------------------------------------------------------------
# DLQ metrics
# ---------------------------------------------------------------------------

dead_letter_queue_depth = Gauge(
    "modularmind_dead_letter_queue_depth",
    "Number of entries in the dead letter queue",
)

# ---------------------------------------------------------------------------
# Embedding cache metrics
# ---------------------------------------------------------------------------

embedding_cache_ops = Counter(
    "modularmind_embedding_cache_ops_total",
    "Embedding cache operations",
    ["result"],  # "hit" or "miss"
)

# ---------------------------------------------------------------------------
# MCP sidecar metrics
# ---------------------------------------------------------------------------

mcp_sidecars_active = Gauge(
    "modularmind_mcp_sidecars_active",
    "Number of active MCP sidecar containers",
)

# ---------------------------------------------------------------------------
# Metric snapshot keys for Redis sorted sets
# ---------------------------------------------------------------------------

METRIC_KEYS = [
    "metrics:cpu",
    "metrics:memory",
    "metrics:disk",
    "metrics:tasks",
    "metrics:queue",
    "metrics:latency",
    "metrics:vram",
    "metrics:llm_latency",
    "metrics:llm_tps",
    "metrics:llm_ttft",
]
METRICS_TTL_SECONDS = 21600  # 6 hours

# ---------------------------------------------------------------------------
# Default alert thresholds
# ---------------------------------------------------------------------------

DEFAULT_THRESHOLDS = {
    "cpu_percent": 90.0,
    "memory_percent": 85.0,
    "workers_min": 1,
    "dlq_max": 10,
    "queue_depth_max": 50,
    "enabled": True,
}

ALERT_COOLDOWN_SECONDS = 60
ALERT_HISTORY_KEY = "monitoring:alerts"
ALERT_THRESHOLDS_KEY = "monitoring:thresholds"
ALERT_MAX_HISTORY = 100

# Cached CPU reading — updated by sampler with a blocking interval in a thread
_last_cpu_percent: float = 0.0

# Model load/unload tracking (module-level, sampler process only)
_previous_model_names: set[str] = set()


# ---------------------------------------------------------------------------
# Cross-process LLM metrics recording (called from worker processes)
# ---------------------------------------------------------------------------


def record_llm_latency(duration_s: float) -> None:
    """Record LLM latency from callback (worker process)."""
    try:
        from src.infra.redis_utils import get_sync_redis_client

        r = get_sync_redis_client()
        r.rpush("metrics:llm_raw_latencies", str(duration_s))
        r.expire("metrics:llm_raw_latencies", METRICS_TTL_SECONDS)
    except Exception as e:
        logger.debug("record_llm_latency failed: %s", e)


def record_llm_tps(tps: float) -> None:
    """Record tokens/sec from callback (worker process)."""
    try:
        from src.infra.redis_utils import get_sync_redis_client

        r = get_sync_redis_client()
        r.rpush("metrics:llm_raw_tps", str(tps))
        r.expire("metrics:llm_raw_tps", METRICS_TTL_SECONDS)
    except Exception as e:
        logger.debug("record_llm_tps failed: %s", e)


def record_llm_ttft(ttft_s: float) -> None:
    """Record TTFT from callback (worker process)."""
    try:
        from src.infra.redis_utils import get_sync_redis_client

        r = get_sync_redis_client()
        r.rpush("metrics:llm_raw_ttft", str(ttft_s))
        r.expire("metrics:llm_raw_ttft", METRICS_TTL_SECONDS)
    except Exception as e:
        logger.debug("record_llm_ttft failed: %s", e)


async def _drain_llm_metrics(redis) -> tuple[list[float], list[float], list[float]]:
    """Atomically drain raw LLM metrics from Redis. Returns (latencies, tps, ttft)."""
    pipe = redis.pipeline()
    pipe.lrange("metrics:llm_raw_latencies", 0, -1)
    pipe.delete("metrics:llm_raw_latencies")
    pipe.lrange("metrics:llm_raw_tps", 0, -1)
    pipe.delete("metrics:llm_raw_tps")
    pipe.lrange("metrics:llm_raw_ttft", 0, -1)
    pipe.delete("metrics:llm_raw_ttft")
    results = await pipe.execute()
    latencies = [float(v) for v in results[0]]
    tps_vals = [float(v) for v in results[2]]
    ttft_vals = [float(v) for v in results[4]]
    return latencies, tps_vals, ttft_vals


# ---------------------------------------------------------------------------
# Periodic sampler — updates gauges that require polling
# ---------------------------------------------------------------------------


async def sample_dlq_depth(r) -> None:
    """Read LLEN of dead_letter from Redis and update gauge."""
    try:
        depth = await r.llen("dead_letter")
        dead_letter_queue_depth.set(depth)
    except Exception as e:
        logger.debug("DLQ depth sample failed: %s", e)


async def snapshot_metrics(r, *, http_client: httpx.AsyncClient | None = None) -> None:
    """Collect current metrics and store in Redis sorted sets for history."""
    global _last_cpu_percent
    try:
        from src.infra.config import get_settings
        from src.infra.redis import check_redis_health

        settings = get_settings()

        now = time.time()
        cutoff = now - METRICS_TTL_SECONDS

        # Use a blocking interval in a thread for accurate CPU reading
        cpu = await asyncio.to_thread(psutil.cpu_percent, 0.1)
        _last_cpu_percent = cpu
        mem = await asyncio.to_thread(psutil.virtual_memory)
        disk = await asyncio.to_thread(psutil.disk_usage, "/")

        queued_exec = await r.xlen("tasks:executions")
        queued_models = await r.xlen("tasks:models")

        _, latency = await check_redis_health()
        active_slots = await r.scard("scheduler:active_slots")

        pipe = r.pipeline(transaction=False)
        # Include timestamp in JSON to guarantee member uniqueness in sorted set
        # (without it, identical values like {"v": 22.8} overwrite each other)
        pipe.zadd("metrics:cpu", {json.dumps({"v": cpu, "t": now}): now})
        pipe.zadd("metrics:memory", {json.dumps({"v": mem.percent, "t": now}): now})
        pipe.zadd("metrics:disk", {json.dumps({"v": disk.percent, "t": now}): now})
        pipe.zadd(
            "metrics:tasks",
            {
                json.dumps(
                    {
                        "active": active_slots,
                        "queued": queued_exec + queued_models,
                        "t": now,
                    }
                ): now
            },
        )
        pipe.zadd(
            "metrics:queue",
            {
                json.dumps(
                    {
                        "executions": queued_exec,
                        "models": queued_models,
                        "t": now,
                    }
                ): now
            },
        )
        if latency is not None:
            pipe.zadd("metrics:latency", {json.dumps({"v": round(latency, 2), "t": now}): now})

        for key in METRIC_KEYS:
            pipe.zremrangebyscore(key, "-inf", cutoff)

        await pipe.execute()

        # --- VRAM / Ollama polling ---
        global _previous_model_names
        try:
            ollama_models = []
            _owns_client = http_client is None
            _client = http_client or httpx.AsyncClient(timeout=5.0)
            try:
                resp = await _client.get(f"{settings.OLLAMA_BASE_URL}/api/ps")
                if resp.status_code == 200:
                    ollama_models = resp.json().get("models", [])
            finally:
                if _owns_client:
                    await _client.aclose()

            from src.infra.gpu import compute_vram_stats

            vram_used, total_vram_gb, vram_pct = compute_vram_stats(
                ollama_models, settings.GPU_TOTAL_VRAM_GB
            )

            # Update Prometheus gauges
            vram_used_bytes.set(vram_used)
            vram_used_percent.set(vram_pct)
            ollama_loaded_models.set(len(ollama_models))

            # Store in Redis sorted set
            await r.zadd(
                "metrics:vram",
                {
                    json.dumps(
                        {
                            "v": round(vram_pct, 2),
                            "used_bytes": vram_used,
                            "model_count": len(ollama_models),
                            "t": now,
                        }
                    ): now
                },
            )

            # Model load/unload tracking
            current_names = {m.get("name", "") for m in ollama_models}
            loaded = current_names - _previous_model_names
            unloaded = _previous_model_names - current_names
            now_iso = datetime.now(UTC).isoformat()

            if loaded or unloaded:
                event_pipe = r.pipeline(transaction=False)
                for name in loaded:
                    event_pipe.rpush(
                        "metrics:model_events",
                        json.dumps(
                            {
                                "type": "load",
                                "model": name,
                                "ts": now_iso,
                            }
                        ),
                    )
                for name in unloaded:
                    event_pipe.rpush(
                        "metrics:model_events",
                        json.dumps(
                            {
                                "type": "unload",
                                "model": name,
                                "ts": now_iso,
                            }
                        ),
                    )
                event_pipe.ltrim("metrics:model_events", -50, -1)
                event_pipe.expire("metrics:model_events", METRICS_TTL_SECONDS)
                await event_pipe.execute()

            _previous_model_names = current_names
        except Exception as e:
            logger.debug("VRAM/Ollama polling failed: %s", e)

        # --- Drain LLM metrics from workers ---
        try:
            latencies, tps_vals, ttft_vals = await _drain_llm_metrics(r)
            if latencies:
                avg_latency_ms = (sum(latencies) / len(latencies)) * 1000
                await r.zadd(
                    "metrics:llm_latency",
                    {
                        json.dumps(
                            {
                                "v": round(avg_latency_ms, 2),
                                "count": len(latencies),
                                "t": now,
                            }
                        ): now
                    },
                )
            if tps_vals:
                avg_tps = sum(tps_vals) / len(tps_vals)
                await r.zadd(
                    "metrics:llm_tps",
                    {
                        json.dumps(
                            {
                                "v": round(avg_tps, 2),
                                "t": now,
                            }
                        ): now
                    },
                )
            if ttft_vals:
                avg_ttft_ms = (sum(ttft_vals) / len(ttft_vals)) * 1000
                await r.zadd(
                    "metrics:llm_ttft",
                    {
                        json.dumps(
                            {
                                "v": round(avg_ttft_ms, 2),
                                "t": now,
                            }
                        ): now
                    },
                )
        except Exception as e:
            logger.debug("LLM metrics drain failed: %s", e)
    except Exception as e:
        logger.debug("Metric snapshot failed: %s", e)


async def get_thresholds(r=None) -> dict:
    """Load alert thresholds from Redis, falling back to defaults.

    If no Redis client is provided, creates and closes one internally.
    """
    owns_client = r is None
    try:
        if owns_client:
            from src.infra.redis import get_redis_client

            r = await get_redis_client()
            if not r:
                return DEFAULT_THRESHOLDS.copy()

        raw = await r.get(ALERT_THRESHOLDS_KEY)
        if raw:
            return json.loads(raw)
        return DEFAULT_THRESHOLDS.copy()
    except Exception as e:
        logger.debug("get_thresholds failed, using defaults: %s", e)
        return DEFAULT_THRESHOLDS.copy()
    finally:
        if owns_client and r:
            await r.aclose()


async def evaluate_alerts(r) -> None:
    """Check current metrics against thresholds and emit alerts."""
    try:
        thresholds = await get_thresholds(r)
        if not thresholds.get("enabled", True):
            return

        now = datetime.now(UTC).isoformat()
        alerts: list[dict] = []

        # CPU — use cached value from snapshot_metrics() (accurate, thread-based)
        cpu = _last_cpu_percent
        if cpu > thresholds.get("cpu_percent", 90.0):
            akey = "monitoring:alert_active:cpu_percent"
            if not await r.exists(akey):
                alerts.append(
                    {
                        "id": str(uuid.uuid4()),
                        "metric": "cpu_percent",
                        "threshold": thresholds["cpu_percent"],
                        "actual": cpu,
                        "message": f"CPU usage at {cpu:.1f}% exceeds threshold of {thresholds['cpu_percent']}%",  # noqa: E501
                        "severity": "critical",
                        "triggered_at": now,
                    }
                )
                await r.setex(akey, ALERT_COOLDOWN_SECONDS, "1")

        # Memory
        mem = await asyncio.to_thread(psutil.virtual_memory)
        if mem.percent > thresholds.get("memory_percent", 85.0):
            akey = "monitoring:alert_active:memory_percent"
            if not await r.exists(akey):
                alerts.append(
                    {
                        "id": str(uuid.uuid4()),
                        "metric": "memory_percent",
                        "threshold": thresholds["memory_percent"],
                        "actual": mem.percent,
                        "message": f"Memory usage at {mem.percent:.1f}% exceeds threshold of {thresholds['memory_percent']}%",  # noqa: E501
                        "severity": "critical",
                        "triggered_at": now,
                    }
                )
                await r.setex(akey, ALERT_COOLDOWN_SECONDS, "1")

        # Workers — check Redis Streams consumer groups
        workers_count = 0
        try:
            groups = await r.xinfo_groups("tasks:executions")
            workers_count = sum(g.get("consumers", 0) for g in groups) if groups else 0
        except Exception as e:
            logger.debug("Worker count check failed: %s", e)

        min_workers = thresholds.get("workers_min", 1)
        if workers_count < min_workers:
            akey = "monitoring:alert_active:workers_min"
            if not await r.exists(akey):
                alerts.append(
                    {
                        "id": str(uuid.uuid4()),
                        "metric": "workers_min",
                        "threshold": min_workers,
                        "actual": workers_count,
                        "message": f"Only {workers_count} stream consumer(s) online (minimum: {min_workers})",  # noqa: E501
                        "severity": "critical",
                        "triggered_at": now,
                    }
                )
                await r.setex(akey, ALERT_COOLDOWN_SECONDS, "1")

        # DLQ
        dlq_depth = await r.llen("dead_letter")
        dlq_max = thresholds.get("dlq_max", 10)
        if dlq_depth > dlq_max:
            akey = "monitoring:alert_active:dlq_max"
            if not await r.exists(akey):
                alerts.append(
                    {
                        "id": str(uuid.uuid4()),
                        "metric": "dlq_max",
                        "threshold": dlq_max,
                        "actual": dlq_depth,
                        "message": f"Dead letter queue has {dlq_depth} entries (max: {dlq_max})",
                        "severity": "warning",
                        "triggered_at": now,
                    }
                )
                await r.setex(akey, ALERT_COOLDOWN_SECONDS, "1")

        # Queue depth from Redis Streams
        total_queued = 0
        for stream_name in ["tasks:executions", "tasks:models"]:
            try:
                total_queued += await r.xlen(stream_name)
            except Exception as e:
                logger.debug("Queue depth check for %s failed: %s", stream_name, e)
        q_max = thresholds.get("queue_depth_max", 50)
        if total_queued > q_max:
            akey = "monitoring:alert_active:queue_depth_max"
            if not await r.exists(akey):
                alerts.append(
                    {
                        "id": str(uuid.uuid4()),
                        "metric": "queue_depth_max",
                        "threshold": q_max,
                        "actual": total_queued,
                        "message": f"Queue depth at {total_queued} exceeds threshold of {q_max}",
                        "severity": "warning",
                        "triggered_at": now,
                    }
                )
                await r.setex(akey, ALERT_COOLDOWN_SECONDS, "1")

        if alerts:
            pipe = r.pipeline(transaction=False)
            for alert in alerts:
                pipe.rpush(ALERT_HISTORY_KEY, json.dumps(alert))
            pipe.ltrim(ALERT_HISTORY_KEY, -ALERT_MAX_HISTORY, -1)
            await pipe.execute()
    except Exception as e:
        logger.debug("Alert evaluation failed: %s", e)


async def start_metrics_sampler(interval: float = 10.0) -> None:
    """Run periodic metrics sampling in background.

    Uses a single persistent Redis client and httpx client for the entire
    sampler lifetime. Collects metric snapshots every 10s and evaluates
    alerts every 30s.
    """
    from src.infra.redis import get_redis_client

    logger.info("Metrics sampler started (interval=%.0fs)", interval)
    r = None
    http_client = httpx.AsyncClient(timeout=5.0)
    tick = 0
    while True:
        try:
            # Acquire or re-acquire Redis client
            if r is None:
                r = await get_redis_client()
            if r is None:
                await asyncio.sleep(interval)
                continue

            await sample_dlq_depth(r)
            await snapshot_metrics(r, http_client=http_client)

            # Evaluate alerts every 3rd tick (30s at 10s interval)
            if tick % 3 == 0:
                await evaluate_alerts(r)

            tick += 1
        except (ConnectionError, TimeoutError, OSError) as e:
            # Redis connection lost — close and re-acquire next iteration
            logger.debug("Metrics sampler Redis error, will reconnect: %s", e)
            if r:
                try:
                    await r.aclose()
                except Exception:
                    logger.debug("Redis close failed during reconnect", exc_info=True)
                r = None
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug("Metrics sampler error: %s", e)
        await asyncio.sleep(interval)

    # Cleanup on exit
    await http_client.aclose()
    if r:
        try:
            await r.aclose()
        except Exception:
            logger.debug("Redis close failed during cleanup", exc_info=True)
