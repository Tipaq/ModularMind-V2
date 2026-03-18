"""
Internal monitoring endpoints.

System metrics, worker status, streaming state,
scheduler status, infrastructure health, and metrics history.
"""

import json
import logging
import time
from datetime import datetime

import httpx
import psutil
from fastapi import APIRouter, Query

from src.auth import CurrentUser, RequireAdmin
from src.infra.config import get_settings
from src.infra.utils import utcnow
from src.internal.schemas import (
    AgentMetricsItem,
    AlertItem,
    AlertSummary,
    ExecutionSummary,
    GPUInfoResponse,
    GpuVramMonitoring,
    InfraMonitoring,
    LiveExecutionsResponse,
    LlmGpuMonitoring,
    LlmPerformanceSnapshot,
    MetricPoint,
    MetricSeries,
    MetricsHistoryResponse,
    ModelEvent,
    MonitoringResponse,
    OllamaRunningModel,
    SchedulerMonitoring,
    StreamingMonitoring,
    SystemMonitoring,
)

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Internal"])

# Track startup time for uptime calculation (shared with main router)
_start_time: float | None = None


def set_start_time(t: float) -> None:
    """Set the shared startup timestamp (called from main router)."""
    global _start_time
    _start_time = t


def get_start_time() -> float:
    """Get the shared startup timestamp."""
    return _start_time or time.time()


RANGE_MAP = {
    "15m": 900,
    "1h": 3600,
    "6h": 21600,
}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/monitoring", dependencies=[RequireAdmin])
async def get_monitoring(user: CurrentUser) -> MonitoringResponse:
    """Comprehensive runtime monitoring data for the dashboard.

    Aggregates system metrics, worker status, streaming state,
    scheduler status, and infrastructure health into a single response.
    """
    from src.executions.scheduler import fair_scheduler
    from src.infra.gpu import detect_gpu
    from src.infra.redis import check_redis_health, get_redis_client

    # === System ===
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_count = psutil.cpu_count(logical=False) or 1
    cpu_count_logical = psutil.cpu_count(logical=True) or 1
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    gpu_info = detect_gpu()

    system = SystemMonitoring(
        cpu_percent=cpu_percent,
        cpu_count=cpu_count,
        cpu_count_logical=cpu_count_logical,
        memory_total_gb=round(mem.total / (1024**3), 2),
        memory_used_gb=round(mem.used / (1024**3), 2),
        memory_percent=mem.percent,
        disk_total_gb=round(disk.total / (1024**3), 2),
        disk_used_gb=round(disk.used / (1024**3), 2),
        disk_percent=disk.percent,
        gpu=GPUInfoResponse(
            available=gpu_info.available,
            type=gpu_info.type,
            device_count=gpu_info.device_count,
            memory_gb=gpu_info.memory_gb,
        ),
    )

    # === Worker ===
    try:
        import redis.asyncio as aioredis

        from src.infra.redis import get_redis_pool
        from src.infra.redis_streams import RedisStreamBus

        bus = RedisStreamBus(aioredis.Redis(connection_pool=get_redis_pool()))
        exec_info = await bus.stream_info("tasks:executions")
        model_info = await bus.stream_info("tasks:models")
        worker_data = {
            "streams": {
                "tasks:executions": exec_info,
                "tasks:models": model_info,
            }
        }
    except Exception as e:
        logger.warning("Worker monitoring failed: %s", e)
        worker_data = {"status": "unavailable"}

    from src.infra.sse import get_active_streams

    streaming_data = StreamingMonitoring(active_streams=get_active_streams())

    redis_ok, redis_latency = await check_redis_health()

    # === Scheduler ===
    scheduler_status = await fair_scheduler.get_status()
    sched_data = SchedulerMonitoring(
        global_current=scheduler_status["global_current"],
        global_max=scheduler_status["global_max"],
        active_slots=scheduler_status["active_slots"],
        backpressure=scheduler_status["global_current"] >= scheduler_status["global_max"],
    )

    # === Infrastructure ===
    ollama_status = "unavailable"
    ollama_models: list[str] = []
    ollama_running: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                data = response.json()
                ollama_models = [m["name"] for m in data.get("models", [])]
                ollama_status = "ok"
            # Also fetch running models
            try:
                ps_resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/ps")
                if ps_resp.status_code == 200:
                    ollama_running = [m["name"] for m in ps_resp.json().get("models", [])]
            except Exception:
                logger.debug("Ollama /api/ps check failed")
    except Exception:
        logger.debug("Ollama connectivity check failed")

    # === Qdrant ===
    qdrant_status = "unavailable"
    qdrant_latency_ms: float | None = None
    qdrant_collections = 0
    try:
        from src.infra.qdrant import qdrant_factory

        q_start = time.monotonic()
        qclient = await qdrant_factory.get_client()
        collections = await qclient.get_collections()
        qdrant_latency_ms = round((time.monotonic() - q_start) * 1000, 2)
        qdrant_status = "ok"
        qdrant_collections = len(collections.collections)
    except Exception:
        logger.debug("Qdrant health check failed")

    infra = InfraMonitoring(
        db_pool_size=settings.DB_POOL_SIZE,
        db_pool_max_overflow=settings.DB_MAX_OVERFLOW,
        redis_max_connections=settings.REDIS_MAX_CONNECTIONS,
        redis_healthy=redis_ok,
        redis_latency_ms=round(redis_latency, 2) if redis_latency else None,
        ollama_status=ollama_status,
        ollama_models=ollama_models,
        ollama_running_models=ollama_running,
        qdrant_status=qdrant_status,
        qdrant_latency_ms=qdrant_latency_ms,
        qdrant_collections=qdrant_collections,
    )

    # === Alerts ===
    alert_summary = AlertSummary()
    try:
        r = await get_redis_client()
        if r:
            try:
                from src.infra.metrics import ALERT_HISTORY_KEY

                keys = [k async for k in r.scan_iter(match="monitoring:alert_active:*", count=100)]
                if keys:
                    alert_summary.active_count = len(keys)
                    raw_alerts = await r.lrange(ALERT_HISTORY_KEY, -len(keys), -1)
                    for raw in raw_alerts:
                        try:
                            alert_summary.active_alerts.append(AlertItem(**json.loads(raw)))
                        except Exception:
                            logger.debug("Malformed alert entry skipped")
            finally:
                await r.aclose()
    except Exception as e:
        logger.debug("Alert summary fetch failed: %s", e)

    return MonitoringResponse(
        timestamp=utcnow().isoformat(),
        uptime_seconds=int(time.time() - get_start_time()),
        system=system,
        worker=worker_data,
        streaming=streaming_data,
        scheduler=sched_data,
        infrastructure=infra,
        alerts=alert_summary,
    )


@router.get("/metrics/history", dependencies=[RequireAdmin])
async def get_metrics_history(
    user: CurrentUser,
    range: str = Query("1h", description="Time range: 15m, 1h, 6h"),
    metrics: str = Query(
        "cpu,memory,tasks,queue,latency",
        description="Comma-separated metric names",
    ),
) -> MetricsHistoryResponse:
    """Retrieve historical metric snapshots from Redis sorted sets."""
    from src.infra.redis import get_redis_client

    range_seconds = RANGE_MAP.get(range, 3600)
    now = time.time()
    start = now - range_seconds

    requested = [m.strip() for m in metrics.split(",")]
    valid_metrics = {
        "cpu",
        "memory",
        "tasks",
        "queue",
        "latency",
        "vram",
        "llm_latency",
        "llm_tps",
        "llm_ttft",
    }
    requested = [m for m in requested if m in valid_metrics]

    r = await get_redis_client()
    if not r:
        return MetricsHistoryResponse(series=[], range_seconds=range_seconds, interval_seconds=10)

    try:
        series: list[MetricSeries] = []
        for metric_name in requested:
            key = f"metrics:{metric_name}"
            raw_points = await r.zrangebyscore(key, start, now, withscores=True)

            points: list[MetricPoint] = []
            for value_bytes, score in raw_points:
                try:
                    value = json.loads(value_bytes)
                    points.append(MetricPoint(ts=score, value=value))
                except Exception:
                    continue

            # Downsample to max ~360 points for large ranges
            max_points = 360
            if len(points) > max_points:
                step = len(points) / max_points
                points = [points[int(i * step)] for i in range(max_points)]

            series.append(MetricSeries(name=metric_name, points=points))

        return MetricsHistoryResponse(
            series=series,
            range_seconds=range_seconds,
            interval_seconds=10,
        )
    finally:
        await r.aclose()


@router.get("/llm-gpu", dependencies=[RequireAdmin])
async def get_llm_gpu_monitoring(user: CurrentUser) -> LlmGpuMonitoring:
    """LLM and GPU monitoring data (Redis-only, no DB dependency)."""
    from src.infra.gpu import detect_gpu
    from src.infra.redis import get_redis_client

    # --- Poll Ollama /api/ps ---
    loaded_models: list[OllamaRunningModel] = []
    vram_used = 0
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/ps")
            if resp.status_code == 200:
                for m in resp.json().get("models", []):
                    size_vram = m.get("size_vram", 0)
                    vram_used += size_vram
                    details = m.get("details", {})
                    loaded_models.append(
                        OllamaRunningModel(
                            name=m.get("name", ""),
                            size_vram_bytes=size_vram,
                            size_vram_gb=round(size_vram / (1024**3), 2),
                            expires_at=m.get("expires_at"),
                            context_length=m.get("context_length", 0),
                            parameter_size=details.get("parameter_size", ""),
                            quantization=details.get("quantization_level", ""),
                            family=details.get("family", ""),
                        )
                    )
    except Exception:
        logger.debug("Ollama model list failed", exc_info=True)

    # --- VRAM totals ---
    total_vram_gb = settings.GPU_TOTAL_VRAM_GB
    if total_vram_gb == 0:
        total_vram_gb = detect_gpu().memory_gb
    total_vram_bytes = int(total_vram_gb * (1024**3))
    used_vram_gb = round(vram_used / (1024**3), 2)
    vram_pct = (vram_used / total_vram_bytes * 100) if total_vram_bytes > 0 else 0.0

    gpu_vram = GpuVramMonitoring(
        total_vram_gb=round(total_vram_gb, 2),
        used_vram_gb=used_vram_gb,
        used_vram_percent=round(vram_pct, 2),
        loaded_models=loaded_models,
        model_count=len(loaded_models),
    )

    # --- LLM Performance from Redis ---
    avg_latency_ms = 0.0
    avg_tps = 0.0
    avg_ttft_ms = 0.0
    total_requests_last_hour = 0

    r = await get_redis_client()
    model_events: list[ModelEvent] = []
    if r:
        try:
            # Latest snapshots
            for key, attr in [
                ("metrics:llm_latency", "latency"),
                ("metrics:llm_tps", "tps"),
                ("metrics:llm_ttft", "ttft"),
            ]:
                entries = await r.zrange(key, -1, -1, withscores=True)
                if entries:
                    val = json.loads(entries[0][0])
                    if attr == "latency":
                        avg_latency_ms = val.get("v", 0)
                    elif attr == "tps":
                        avg_tps = val.get("v", 0)
                    elif attr == "ttft":
                        avg_ttft_ms = val.get("v", 0)

            # Total requests last hour
            now = time.time()
            hour_ago = now - 3600
            hour_entries = await r.zrangebyscore("metrics:llm_latency", hour_ago, now)
            for entry in hour_entries:
                try:
                    val = json.loads(entry)
                    total_requests_last_hour += val.get("count", 0)
                except (json.JSONDecodeError, TypeError):
                    logger.debug("Malformed latency metric entry")

            # Model events
            raw_events = await r.lrange("metrics:model_events", 0, -1)
            for raw in raw_events:
                try:
                    evt = json.loads(raw)
                    model_events.append(ModelEvent(**evt))
                except (json.JSONDecodeError, TypeError, ValueError):
                    logger.debug("Malformed model event entry")
        finally:
            await r.aclose()

    llm_perf = LlmPerformanceSnapshot(
        avg_latency_ms=round(avg_latency_ms, 2),
        avg_tokens_per_second=round(avg_tps, 2),
        avg_ttft_ms=round(avg_ttft_ms, 2),
        total_requests_last_hour=total_requests_last_hour,
    )

    return LlmGpuMonitoring(
        gpu_vram=gpu_vram,
        llm_performance=llm_perf,
        model_events=model_events,
    )


@router.get("/metrics/agents", dependencies=[RequireAdmin])
async def get_agent_metrics(user: CurrentUser) -> list[AgentMetricsItem]:
    """Per-agent execution metrics from last 24h."""
    from datetime import timedelta

    from sqlalchemy import case, extract, func, select

    from src.executions.models import ExecutionRun, ExecutionStatus
    from src.infra.database import get_db_readonly

    results: list[AgentMetricsItem] = []

    async for db in get_db_readonly():
        stmt = (
            select(
                ExecutionRun.agent_id,
                func.count().label("total_executions"),
                func.coalesce(
                    func.sum(ExecutionRun.tokens_prompt + ExecutionRun.tokens_completion), 0
                ).label("total_tokens"),
                func.avg(
                    extract("epoch", ExecutionRun.completed_at - ExecutionRun.started_at) * 1000
                ).label("avg_duration_ms"),
                func.sum(
                    case(
                        (ExecutionRun.status == ExecutionStatus.FAILED, 1),
                        else_=0,
                    )
                ).label("error_count"),
            )
            .where(
                ExecutionRun.started_at >= utcnow() - timedelta(hours=24),
                ExecutionRun.agent_id.isnot(None),
                ExecutionRun.completed_at.isnot(None),
            )
            .group_by(ExecutionRun.agent_id)
        )
        rows = (await db.execute(stmt)).all()

        # Batch-resolve agent names upfront instead of per-row
        agent_name_map: dict[str, str] = {}
        try:
            from src.domain_config import get_config_provider

            provider = get_config_provider()
            for row in rows:
                aid = str(row.agent_id)
                cfg = await provider.get_agent_config(aid)
                if cfg and hasattr(cfg, "name"):
                    agent_name_map[aid] = cfg.name
        except Exception:
            logger.debug("Agent name resolution failed", exc_info=True)

        for row in rows:
            total_exec = row.total_executions or 0
            err_count = row.error_count or 0
            error_rate = (err_count / total_exec * 100) if total_exec > 0 else 0.0
            aid = str(row.agent_id)

            results.append(
                AgentMetricsItem(
                    agent_id=aid,
                    agent_name=agent_name_map.get(aid, aid),
                    total_executions=total_exec,
                    total_tokens=row.total_tokens or 0,
                    avg_duration_ms=round(row.avg_duration_ms or 0, 2),
                    error_count=err_count,
                    error_rate=round(error_rate, 2),
                )
            )

    return results


@router.get("/executions/live", dependencies=[RequireAdmin])
async def get_live_executions(user: CurrentUser) -> LiveExecutionsResponse:
    """Active and recently completed executions across all users.

    Active: pending / running / paused / awaiting_approval.
    Recent: last 20 completed / failed / stopped in the past hour.
    """
    from datetime import timedelta

    from sqlalchemy import select

    from src.auth.models import User
    from src.executions.models import ExecutionRun, ExecutionStatus
    from src.infra.database import get_db_readonly

    _ACTIVE_STATUSES = [
        ExecutionStatus.PENDING,
        ExecutionStatus.RUNNING,
        ExecutionStatus.PAUSED,
        ExecutionStatus.AWAITING_APPROVAL,
    ]
    _TERMINAL_STATUSES = [
        ExecutionStatus.COMPLETED,
        ExecutionStatus.FAILED,
        ExecutionStatus.STOPPED,
    ]

    def _to_summary(run: ExecutionRun, email: str | None, now: datetime) -> ExecutionSummary:
        started = run.started_at
        completed = run.completed_at
        if completed and started:
            duration: float | None = (completed - started).total_seconds()
        elif started and run.status in (ExecutionStatus.RUNNING, ExecutionStatus.PAUSED):
            duration = (now - started).total_seconds()
        else:
            duration = None

        return ExecutionSummary(
            id=run.id,
            execution_type=run.execution_type.value,
            status=run.status.value,
            user_id=run.user_id,
            user_email=email or "unknown",
            agent_id=run.agent_id,
            graph_id=run.graph_id,
            model=run.model,
            tokens_prompt=run.tokens_prompt,
            tokens_completion=run.tokens_completion,
            input_preview=run.input_prompt[:100],
            started_at=started.isoformat() if started else None,
            created_at=run.created_at.isoformat(),
            completed_at=completed.isoformat() if completed else None,
            duration_seconds=round(duration, 1) if duration is not None else None,
        )

    active_summaries: list[ExecutionSummary] = []
    recent_summaries: list[ExecutionSummary] = []

    async for db in get_db_readonly():
        now = utcnow()
        one_hour_ago = now - timedelta(hours=1)

        # Query execution runs directly (no JOIN) to avoid silent row elimination
        # when a user_id has no matching row in users (e.g. stale FK or deleted user).
        active_runs = (
            (
                await db.execute(
                    select(ExecutionRun)
                    .where(ExecutionRun.status.in_(_ACTIVE_STATUSES))
                    .order_by(ExecutionRun.created_at.desc())
                )
            )
            .scalars()
            .all()
        )

        recent_runs = (
            (
                await db.execute(
                    select(ExecutionRun)
                    .where(
                        ExecutionRun.status.in_(_TERMINAL_STATUSES),
                        ExecutionRun.created_at >= one_hour_ago,
                    )
                    .order_by(ExecutionRun.created_at.desc())
                    .limit(20)
                )
            )
            .scalars()
            .all()
        )

        # Batch-fetch emails for all referenced user IDs in one query
        all_user_ids = list({r.user_id for r in [*active_runs, *recent_runs]})
        email_map: dict[str, str] = {}
        if all_user_ids:
            user_rows = (
                await db.execute(select(User.id, User.email).where(User.id.in_(all_user_ids)))
            ).all()
            email_map = {uid: email for uid, email in user_rows}

        active_summaries = [_to_summary(r, email_map.get(r.user_id), now) for r in active_runs]
        recent_summaries = [_to_summary(r, email_map.get(r.user_id), now) for r in recent_runs]

    return LiveExecutionsResponse(
        active=active_summaries,
        recent=recent_summaries,
        total_active=len(active_summaries),
    )
