"""Report router — Engine health and metrics endpoints."""

from fastapi import APIRouter

from src.auth import RequireAdmin

from .schemas import MetricsResponse, ModelsResponse, PipelineResponse, StatusResponse
from .service import ReportService

router = APIRouter(prefix="/report", tags=["Report"], dependencies=[RequireAdmin])


@router.get("/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    """Engine status: uptime, version, connections."""
    svc = ReportService()
    return await svc.get_status()


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics() -> MetricsResponse:
    """Execution counts, latencies, queue depth."""
    svc = ReportService()
    return await svc.get_metrics()


@router.get("/models", response_model=ModelsResponse)
async def get_models() -> ModelsResponse:
    """Available models and their status."""
    svc = ReportService()
    return await svc.get_models()


@router.get("/pipeline", response_model=PipelineResponse)
async def get_pipeline() -> PipelineResponse:
    """Memory pipeline stream info (pending, lag, DLQ)."""
    svc = ReportService()
    return await svc.get_pipeline()
