"""
Fine-tuning API router.

Provides endpoints for dataset management, job orchestration,
curation, cost estimation, model deployment, and A/B experiments.
"""

from __future__ import annotations

import logging
from pathlib import Path

import redis as redis_mod
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from src.auth import CurrentUser, RequireOwner
from src.infra.config import get_settings
from src.infra.database import DbSession

from .models import DatasetStatus
from .schemas import (
    AgentFineTuningConfigResponse,
    AgentFineTuningConfigUpdate,
    BulkCurationUpdate,
    DatasetCreate,
    DatasetListResponse,
    DatasetProgress,
    DatasetResponse,
    EstimateCostRequest,
    EstimateCostResponse,
    ExampleCurationUpdate,
    ExampleResponse,
    ExperimentCreate,
    ExperimentListResponse,
    ExperimentResponse,
    JobCreate,
    JobListResponse,
    JobResponse,
)
from .service import FineTuningService

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/fine-tuning", tags=["Fine-Tuning"])


def _safe_error(e: Exception, fallback: str = "Operation failed") -> str:
    """Sanitize exception for client response — log full detail, return generic message."""
    logger.warning("%s: %s", fallback, e, exc_info=True)
    return fallback


# ---------------------------------------------------------------------------
# Datasets
# ---------------------------------------------------------------------------


@router.post(
    "/datasets",
    response_model=DatasetResponse,
    status_code=201,
    dependencies=[RequireOwner],
)
async def create_dataset(
    data: DatasetCreate,
    user: CurrentUser,
    db: DbSession,
) -> DatasetResponse:
    """Create a new fine-tuning dataset. Triggers async build via Redis Streams."""
    try:
        svc = FineTuningService(db)
        dataset = await svc.create_dataset(data, str(user.id))
        return DatasetResponse.model_validate(dataset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Dataset creation failed")) from e


@router.get("/datasets", response_model=DatasetListResponse)
async def list_datasets(
    user: CurrentUser,
    db: DbSession,
    agent_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> DatasetListResponse:
    """List datasets with optional agent filter."""
    svc = FineTuningService(db)
    return await svc.list_datasets(agent_id=agent_id, page=page, page_size=page_size)


@router.get("/datasets/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    user: CurrentUser,
    db: DbSession,
) -> DatasetResponse:
    """Get a single dataset."""
    try:
        svc = FineTuningService(db)
        dataset = await svc.get_dataset(dataset_id)
        return DatasetResponse.model_validate(dataset)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e, "Dataset not found")) from e


@router.get("/datasets/{dataset_id}/progress", response_model=DatasetProgress)
async def get_dataset_progress(
    dataset_id: str,
    user: CurrentUser,
    db: DbSession,
) -> DatasetProgress:
    """Get live build progress for a dataset (Redis polling)."""
    from src.infra.redis import get_redis_client

    # Check dataset exists
    svc = FineTuningService(db)
    try:
        dataset = await svc.get_dataset(dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e, "Dataset not found")) from e

    # Get Redis progress (async — avoids blocking the event loop)
    try:
        r = await get_redis_client()
        data = await r.hgetall(f"runtime:dataset_progress:{dataset_id}")
        await r.aclose()
        if data:
            return DatasetProgress(
                status=data.get("status", "unknown"),
                progress_pct=int(data.get("progress", 0)),
                examples_found=int(data.get("examples_found", 0)),
            )
    except (ConnectionError, OSError, redis_mod.RedisError):
        logger.warning("Redis unavailable for dataset progress %s", dataset_id)

    return DatasetProgress(status=dataset.status.value)


@router.delete(
    "/datasets/{dataset_id}",
    status_code=204,
    dependencies=[RequireOwner],
)
async def delete_dataset(
    dataset_id: str,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a dataset and its associated files."""
    try:
        svc = FineTuningService(db)
        await svc.delete_dataset(dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e, "Dataset not found")) from e


@router.get("/datasets/{dataset_id}/download")
async def download_dataset(
    dataset_id: str,
    user: CurrentUser,
    db: DbSession,
) -> FileResponse:
    """Download the JSONL dataset file."""
    svc = FineTuningService(db)
    try:
        dataset = await svc.get_dataset(dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e, "Dataset not found")) from e

    if dataset.status != DatasetStatus.READY or not dataset.file_path:
        raise HTTPException(status_code=400, detail="Dataset not ready for download")

    path = Path(dataset.file_path)
    storage_dir = Path(settings.FINETUNING_STORAGE_DIR).resolve()
    if not path.resolve().is_relative_to(storage_dir) or not path.exists():
        raise HTTPException(status_code=404, detail="Dataset file not found")

    return FileResponse(
        path=str(path),
        media_type="application/jsonl",
        filename=f"{dataset.name}.jsonl",
    )


# ---------------------------------------------------------------------------
# Curation
# ---------------------------------------------------------------------------


@router.get("/datasets/{dataset_id}/examples")
async def list_examples(
    dataset_id: str,
    user: CurrentUser,
    db: DbSession,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """List examples in a dataset with optional curation status filter."""
    svc = FineTuningService(db)
    try:
        examples, total = await svc.get_examples(
            dataset_id, status=status, page=page, page_size=page_size
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e, "Examples not found")) from e

    return {
        "items": [ExampleResponse.model_validate(ex) for ex in examples],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch("/examples/{example_id}", response_model=ExampleResponse)
async def update_example(
    example_id: str,
    data: ExampleCurationUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ExampleResponse:
    """Update a single example's curation status or content."""
    svc = FineTuningService(db)
    try:
        example = await svc.update_example(example_id, data, str(user.id))
        return ExampleResponse.model_validate(example)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e, "Example not found")) from e


@router.post(
    "/examples/bulk-curate",
    dependencies=[RequireOwner],
)
async def bulk_curate(
    data: BulkCurationUpdate,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Bulk update curation status for multiple examples."""
    svc = FineTuningService(db)
    count = await svc.bulk_curate(data, str(user.id))
    return {"updated": count}


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


@router.post(
    "/jobs",
    response_model=JobResponse,
    status_code=201,
    dependencies=[RequireOwner],
)
async def create_job(
    data: JobCreate,
    user: CurrentUser,
    db: DbSession,
) -> JobResponse:
    """Create a fine-tuning job."""
    try:
        svc = FineTuningService(db)
        job = await svc.create_job(data, str(user.id))
        return JobResponse.model_validate(job)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Job creation failed")) from e


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    user: CurrentUser,
    db: DbSession,
    agent_id: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> JobListResponse:
    """List fine-tuning jobs."""
    svc = FineTuningService(db)
    return await svc.list_jobs(agent_id=agent_id, status=status, page=page, page_size=page_size)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    user: CurrentUser,
    db: DbSession,
) -> JobResponse:
    """Get a single job with live progress."""
    svc = FineTuningService(db)
    try:
        job = await svc.get_job(job_id)
        response = JobResponse.model_validate(job)
        # Merge live progress from Redis
        progress = await svc.get_job_progress(job_id)
        response.progress = progress
        return response
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e, "Job not found")) from e


@router.post(
    "/jobs/{job_id}/cancel",
    dependencies=[RequireOwner],
)
async def cancel_job(
    job_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Cancel a running fine-tuning job."""
    svc = FineTuningService(db)
    try:
        await svc.cancel_job(job_id)
        return {"status": "cancelled"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Job cancellation failed")) from e


@router.post(
    "/jobs/{job_id}/deploy/{agent_id}",
    dependencies=[RequireOwner],
)
async def deploy_model(
    job_id: str,
    agent_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Deploy a fine-tuned model to an agent."""
    svc = FineTuningService(db)
    try:
        await svc.deploy_model(job_id, agent_id)
        return {"status": "deployed", "job_id": job_id, "agent_id": agent_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Model deployment failed")) from e


@router.post(
    "/jobs/{job_id}/rollback/{agent_id}",
    dependencies=[RequireOwner],
)
async def rollback_model(
    job_id: str,
    agent_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Rollback an agent to its previous model."""
    svc = FineTuningService(db)
    try:
        await svc.rollback_model(job_id, agent_id)
        return {"status": "rolled_back", "job_id": job_id, "agent_id": agent_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Model rollback failed")) from e


# Cost estimation (placed before /jobs/{id} to avoid route conflict)
@router.post("/estimate-cost", response_model=EstimateCostResponse)
async def estimate_cost(
    data: EstimateCostRequest,
    user: CurrentUser,
    db: DbSession,
) -> EstimateCostResponse:
    """Estimate fine-tuning cost for a dataset."""
    svc = FineTuningService(db)
    try:
        return await svc.estimate_cost(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Cost estimation failed")) from e


# ---------------------------------------------------------------------------
# Experiments
# ---------------------------------------------------------------------------


@router.post(
    "/experiments",
    response_model=ExperimentResponse,
    status_code=201,
    dependencies=[RequireOwner],
)
async def create_experiment(
    data: ExperimentCreate,
    user: CurrentUser,
    db: DbSession,
) -> ExperimentResponse:
    """Create an A/B test experiment."""
    svc = FineTuningService(db)
    try:
        experiment = await svc.create_experiment(data, str(user.id))
        return ExperimentResponse.model_validate(experiment)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Experiment creation failed")) from e


@router.get("/experiments", response_model=ExperimentListResponse)
async def list_experiments(
    user: CurrentUser,
    db: DbSession,
    agent_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ExperimentListResponse:
    """List experiments."""
    svc = FineTuningService(db)
    return await svc.list_experiments(agent_id=agent_id, page=page, page_size=page_size)


@router.get("/experiments/{experiment_id}", response_model=ExperimentResponse)
async def get_experiment(
    experiment_id: str,
    user: CurrentUser,
    db: DbSession,
) -> ExperimentResponse:
    """Get experiment with computed metrics."""
    svc = FineTuningService(db)
    try:
        experiment = await svc.get_experiment(experiment_id)
        return ExperimentResponse.model_validate(experiment)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e, "Experiment not found")) from e


@router.post(
    "/experiments/{experiment_id}/start",
    dependencies=[RequireOwner],
)
async def start_experiment(
    experiment_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Start an A/B test experiment."""
    svc = FineTuningService(db)
    try:
        await svc.start_experiment(experiment_id)
        return {"status": "started", "experiment_id": experiment_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Experiment start failed")) from e


@router.post(
    "/experiments/{experiment_id}/stop",
    dependencies=[RequireOwner],
)
async def stop_experiment(
    experiment_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Stop an A/B test experiment."""
    svc = FineTuningService(db)
    try:
        await svc.stop_experiment(experiment_id)
        return {"status": "stopped", "experiment_id": experiment_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_safe_error(e, "Experiment stop failed")) from e


# ---------------------------------------------------------------------------
# Agent fine-tuning config
# ---------------------------------------------------------------------------


@router.get(
    "/config/{agent_id}",
    response_model=AgentFineTuningConfigResponse,
)
async def get_agent_ft_config(
    agent_id: str,
    user: CurrentUser,
    db: DbSession,
) -> AgentFineTuningConfigResponse:
    """Get per-agent fine-tuning config."""
    svc = FineTuningService(db)
    config = await svc.get_agent_config(agent_id)
    return AgentFineTuningConfigResponse.model_validate(config)


@router.patch(
    "/config/{agent_id}",
    response_model=AgentFineTuningConfigResponse,
    dependencies=[RequireOwner],
)
async def update_agent_ft_config(
    agent_id: str,
    data: AgentFineTuningConfigUpdate,
    user: CurrentUser,
    db: DbSession,
) -> AgentFineTuningConfigResponse:
    """Update per-agent fine-tuning settings."""
    svc = FineTuningService(db)
    config = await svc.update_agent_config(agent_id, data)
    return AgentFineTuningConfigResponse.model_validate(config)
