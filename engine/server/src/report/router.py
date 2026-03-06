"""Report router — Engine health and metrics endpoints."""

from fastapi import APIRouter

from src.auth import RequireAdmin

from .service import ReportService

router = APIRouter(prefix="/report", tags=["Report"], dependencies=[RequireAdmin])


@router.get("/status")
async def get_status() -> dict:
    """Engine status: uptime, version, connections."""
    svc = ReportService()
    return await svc.get_status()


@router.get("/metrics")
async def get_metrics() -> dict:
    """Execution counts, latencies, queue depth."""
    svc = ReportService()
    return await svc.get_metrics()


@router.get("/models")
async def get_models() -> dict:
    """Available models and their status."""
    svc = ReportService()
    return await svc.get_models()


@router.get("/pipeline")
async def get_pipeline() -> dict:
    """Memory pipeline stream info (pending, lag, DLQ)."""
    svc = ReportService()
    return await svc.get_pipeline()
