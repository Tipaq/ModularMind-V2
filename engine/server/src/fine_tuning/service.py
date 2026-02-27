"""
Fine-tuning service.

Main orchestration layer for datasets, jobs, curation, deployment,
cost estimation, and experiments.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config.provider import get_config_provider
from src.infra.config import get_settings

from .models import (
    ABTestExperiment,
    AgentFineTuningConfig,
    CurationStatus,
    DatasetExample,
    DatasetStatus,
    ExperimentStatus,
    FineTuningDataset,
    FineTuningJob,
    JobProvider,
    JobStatus,
    utcnow,
)
from .schemas import (
    AgentFineTuningConfigResponse,
    AgentFineTuningConfigUpdate,
    BulkCurationUpdate,
    DatasetCreate,
    DatasetListResponse,
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
    JobProgress,
    JobResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# OpenAI training pricing per 1M tokens (USD)
PRICING_PER_1M_TOKENS: dict[str, float] = {
    "gpt-4o-mini": 3.0,
    "gpt-4o": 25.0,
}


class FineTuningService:
    """Orchestrates fine-tuning datasets, jobs, curation, and experiments."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # -----------------------------------------------------------------------
    # Dataset management
    # -----------------------------------------------------------------------

    async def create_dataset(
        self, data: DatasetCreate, user_id: str
    ) -> FineTuningDataset:
        """Create a dataset record and dispatch the build task."""
        # Validate agent exists
        config = get_config_provider()
        agent = await config.get_agent_config(data.agent_id)
        if agent is None:
            raise ValueError(f"Agent config not found: {data.agent_id}")

        dataset = FineTuningDataset(
            agent_id=data.agent_id,
            user_id=user_id,
            name=data.name,
            description=data.description,
            filters=data.filters.model_dump(),
            format=data.format,
            status=DatasetStatus.BUILDING,
        )
        self.db.add(dataset)
        await self.db.commit()
        await self.db.refresh(dataset)

        # Dispatch build task via Redis Streams
        from src.infra.publish import enqueue_dataset_build
        await enqueue_dataset_build(dataset.id, data.agent_id, json.dumps(data.filters.model_dump()))

        logger.info("Created dataset %s for agent %s", dataset.id, data.agent_id)
        return dataset

    async def get_dataset(self, dataset_id: str) -> FineTuningDataset:
        """Get a single dataset by ID."""
        dataset = await self.db.get(FineTuningDataset, dataset_id)
        if dataset is None:
            raise ValueError(f"Dataset not found: {dataset_id}")
        return dataset

    async def list_datasets(
        self, agent_id: str | None = None, page: int = 1, page_size: int = 20
    ) -> DatasetListResponse:
        """List datasets with optional agent filter and pagination."""
        query = select(FineTuningDataset)
        count_query = select(func.count(FineTuningDataset.id))

        if agent_id:
            query = query.where(FineTuningDataset.agent_id == agent_id)
            count_query = count_query.where(FineTuningDataset.agent_id == agent_id)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(FineTuningDataset.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        datasets = result.scalars().all()

        return DatasetListResponse(
            items=[DatasetResponse.model_validate(d) for d in datasets],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def delete_dataset(self, dataset_id: str) -> None:
        """Delete a dataset, its examples, and associated JSONL file."""
        dataset = await self.get_dataset(dataset_id)

        # Delete file from disk
        if dataset.file_path:
            try:
                path = Path(dataset.file_path)
                # Security: ensure path is within FINETUNING_STORAGE_DIR
                storage_dir = Path(settings.FINETUNING_STORAGE_DIR).resolve()
                if path.resolve().is_relative_to(storage_dir) and path.exists():
                    path.unlink()
            except OSError:
                logger.warning("Failed to delete dataset file: %s", dataset.file_path)

        await self.db.delete(dataset)
        await self.db.commit()

    # -----------------------------------------------------------------------
    # Job management
    # -----------------------------------------------------------------------

    async def create_job(self, data: JobCreate, user_id: str) -> FineTuningJob:
        """Create a fine-tuning job. Respects concurrent job limits."""
        dataset = await self.get_dataset(data.dataset_id)
        if dataset.status != DatasetStatus.READY:
            raise ValueError(
                f"Dataset {data.dataset_id} is not ready (status: {dataset.status.value})"
            )

        # Check API key for OpenAI provider
        if data.provider == JobProvider.OPENAI:
            from src.infra.secrets import get_secrets_store

            secrets = get_secrets_store()
            if not secrets.get_provider_key("openai"):
                raise ValueError(
                    "OpenAI API key not configured. Set it in Settings > LLM API Keys."
                )

        job = FineTuningJob(
            dataset_id=data.dataset_id,
            agent_id=dataset.agent_id,
            user_id=user_id,
            provider=data.provider,
            base_model=data.base_model,
            hyperparameters=data.hyperparameters.model_dump(),
        )

        # Check concurrent job limit for OpenAI
        if data.provider == JobProvider.OPENAI:
            active_count = await self._count_active_openai_jobs()
            if active_count >= settings.FINETUNING_MAX_CONCURRENT_JOBS:
                job.status = JobStatus.PENDING
                logger.warning(
                    "OpenAI rate limit: %d/%d concurrent jobs. Job %s queued.",
                    active_count,
                    settings.FINETUNING_MAX_CONCURRENT_JOBS,
                    job.id,
                )
            else:
                job.status = JobStatus.VALIDATING
        else:
            job.status = JobStatus.VALIDATING

        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        # Dispatch only if not rate-limited
        if job.status != JobStatus.PENDING:
            from src.infra.publish import enqueue_fine_tuning_job
            msg_id = await enqueue_fine_tuning_job(job.id)
            job.stream_task_id = msg_id
            await self.db.commit()

        logger.info("Created job %s (provider=%s, status=%s)", job.id, data.provider.value, job.status.value)
        return job

    async def get_job(self, job_id: str) -> FineTuningJob:
        """Get a single job by ID."""
        job = await self.db.get(FineTuningJob, job_id)
        if job is None:
            raise ValueError(f"Job not found: {job_id}")
        return job

    async def get_job_progress(self, job_id: str) -> JobProgress:
        """Merge DB status with Redis live progress."""
        job = await self.get_job(job_id)
        progress = JobProgress(status=job.status.value)

        # Try to get live progress from Redis
        try:
            from src.infra.redis_utils import get_sync_redis_client

            redis = get_sync_redis_client()
            data = redis.hgetall(f"runtime:ft_job_progress:{job_id}")
            if data:
                progress.progress_pct = int(data.get(b"progress", 0))
                progress.current_step = (
                    data.get(b"current_step", b"").decode("utf-8")
                )
                loss = data.get(b"loss")
                if loss:
                    progress.loss = float(loss)
        except Exception:
            pass  # Redis unavailable, return DB-only status

        return progress

    async def list_jobs(
        self,
        agent_id: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> JobListResponse:
        """List jobs with optional filters and pagination."""
        query = select(FineTuningJob)
        count_query = select(func.count(FineTuningJob.id))

        if agent_id:
            query = query.where(FineTuningJob.agent_id == agent_id)
            count_query = count_query.where(FineTuningJob.agent_id == agent_id)
        if status:
            query = query.where(FineTuningJob.status == status)
            count_query = count_query.where(FineTuningJob.status == status)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(FineTuningJob.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        jobs = result.scalars().all()

        return JobListResponse(
            items=[JobResponse.model_validate(j) for j in jobs],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def cancel_job(self, job_id: str) -> None:
        """Cancel a running job."""
        job = await self.get_job(job_id)
        if job.status not in (JobStatus.PENDING, JobStatus.VALIDATING, JobStatus.TRAINING):
            raise ValueError(f"Cannot cancel job with status: {job.status.value}")

        # Cancel task via Redis intent key
        if job.stream_task_id:
            from src.infra.redis import get_redis_client
            r = await get_redis_client()
            if r:
                try:
                    await r.set(f"revoke_intent:ft:{job.id}", "cancel", ex=3600)
                finally:
                    await r.aclose()

        job.status = JobStatus.CANCELLED
        job.completed_at = utcnow()
        await self.db.commit()

    # -----------------------------------------------------------------------
    # Model deployment
    # -----------------------------------------------------------------------

    async def deploy_model(self, job_id: str, agent_id: str) -> None:
        """Deploy a fine-tuned model to an agent."""
        job = await self.get_job(job_id)
        if job.status != JobStatus.COMPLETED:
            raise ValueError(f"Cannot deploy: job status is {job.status.value}")

        model_id = job.openai_model_id
        if not model_id and job.provider == JobProvider.OPENAI:
            raise ValueError("Job completed but no fine-tuned model ID available")

        # For local export, model_id should be set by the user after external fine-tuning
        if job.provider == JobProvider.LOCAL_EXPORT:
            raise ValueError(
                "Local export jobs require manual model registration. "
                "Configure the model in Settings > Models after fine-tuning."
            )

        # Acquire Redis lock for config file writes
        from src.infra.redis_utils import get_sync_redis_client

        redis = get_sync_redis_client()
        lock = redis.lock(f"runtime:agent_config_lock:{agent_id}", timeout=30)
        if not lock.acquire(blocking=True, blocking_timeout=10):
            raise RuntimeError("Could not acquire config lock for deployment")

        try:
            config = get_config_provider()
            agent_config = await config.get_agent_config(agent_id)
            if agent_config is None:
                raise ValueError(f"Agent config not found: {agent_id}")

            # Store previous model for rollback
            previous_model_id = agent_config.model_id
            job.metrics["previous_model_id"] = previous_model_id
            job.metrics["deployed_to"] = agent_id

            # Construct full model_id in provider:model format
            full_model_id = f"openai:{model_id}"

            # Atomic config file update
            await self._update_agent_config(agent_id, "model_id", full_model_id)

            await self.db.commit()

            # Trigger config reload
            await self._reload_config()

            logger.info(
                "Deployed model %s to agent %s (previous: %s)",
                full_model_id,
                agent_id,
                previous_model_id,
            )
        finally:
            lock.release()

    async def rollback_model(self, job_id: str, agent_id: str) -> None:
        """Rollback an agent to its previous model."""
        job = await self.get_job(job_id)
        previous_model_id = job.metrics.get("previous_model_id")
        if not previous_model_id:
            raise ValueError(
                "No previous model_id found in job metrics. "
                "This job may not have been deployed."
            )

        from src.infra.redis_utils import get_sync_redis_client

        redis = get_sync_redis_client()
        lock = redis.lock(f"runtime:agent_config_lock:{agent_id}", timeout=30)
        if not lock.acquire(blocking=True, blocking_timeout=10):
            raise RuntimeError("Could not acquire config lock for rollback")

        try:
            await self._update_agent_config(agent_id, "model_id", previous_model_id)
            await self._reload_config()
            logger.info("Rolled back agent %s to model %s", agent_id, previous_model_id)
        finally:
            lock.release()

    async def _update_agent_config(
        self, agent_id: str, key: str, value: str
    ) -> None:
        """Atomically update a field in the agent config JSON file."""
        config_dir = Path(settings.CONFIG_DIR) / "agents"
        config_path = config_dir / f"{agent_id}.json"

        if not config_path.exists():
            raise ValueError(f"Agent config file not found: {config_path}")

        # Read, modify, write atomically
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = json.load(f)

        config_data[key] = value

        # Write to temp file, then atomic replace
        fd, tmp_path = tempfile.mkstemp(
            dir=str(config_dir), suffix=".tmp", prefix=f"{agent_id}_"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2, default=str)
            os.replace(tmp_path, str(config_path))
        except Exception:
            # Cleanup temp file on error
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    async def _reload_config(self) -> None:
        """Trigger runtime config reload."""
        try:
            import httpx

            async with httpx.AsyncClient() as client:
                await client.post(
                    "http://localhost:8000/api/v1/internal/reload",
                    headers={"X-Internal-Token": settings.SECRET_KEY},
                    timeout=5.0,
                )
        except Exception:
            logger.warning("Failed to trigger config reload", exc_info=True)

    # -----------------------------------------------------------------------
    # Curation
    # -----------------------------------------------------------------------

    async def get_examples(
        self,
        dataset_id: str,
        status_filter: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> list[DatasetExample]:
        """Get examples for a dataset with optional status filter."""
        query = select(DatasetExample).where(
            DatasetExample.dataset_id == dataset_id
        )
        if status_filter:
            query = query.where(DatasetExample.curation_status == status_filter)

        query = query.order_by(DatasetExample.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_example(
        self, example_id: str, update: ExampleCurationUpdate, user_id: str
    ) -> DatasetExample:
        """Update a single example's curation status or content."""
        example = await self.db.get(DatasetExample, example_id)
        if example is None:
            raise ValueError(f"Example not found: {example_id}")

        if update.curation_status is not None:
            example.curation_status = update.curation_status
            example.curated_by = user_id
            example.curated_at = utcnow()

        if update.messages is not None:
            example.messages = update.messages

        await self.db.commit()
        await self.db.refresh(example)
        return example

    async def bulk_curate(self, update: BulkCurationUpdate, user_id: str) -> int:
        """Bulk update curation status for multiple examples."""
        now = utcnow()
        count = 0
        for eid in update.example_ids:
            example = await self.db.get(DatasetExample, eid)
            if example:
                example.curation_status = update.curation_status
                example.curated_by = user_id
                example.curated_at = now
                count += 1

        await self.db.commit()
        return count

    # -----------------------------------------------------------------------
    # Cost estimation
    # -----------------------------------------------------------------------

    async def estimate_cost(
        self, dataset_id: str, base_model: str, n_epochs: int = 3
    ) -> EstimateCostResponse:
        """Estimate fine-tuning cost from dataset token stats."""
        dataset = await self.get_dataset(dataset_id)
        token_stats = (dataset.validation_results or {}).get("token_stats", {})
        total_tokens = token_stats.get("total", 0)

        price_per_1m = PRICING_PER_1M_TOKENS.get(base_model, 3.0)
        estimated_cost = (total_tokens * n_epochs * price_per_1m) / 1_000_000

        return EstimateCostResponse(
            estimated_cost_usd=round(estimated_cost, 2),
            total_tokens=total_tokens,
            epochs=n_epochs,
            price_per_1m_tokens=price_per_1m,
        )

    # -----------------------------------------------------------------------
    # Experiment management
    # -----------------------------------------------------------------------

    async def create_experiment(
        self, data: ExperimentCreate, user_id: str
    ) -> ABTestExperiment:
        """Create an A/B test experiment."""
        experiment = ABTestExperiment(
            agent_id=data.agent_id,
            user_id=user_id,
            name=data.name,
            control_model_id=data.control_model_id,
            treatment_model_id=data.treatment_model_id,
            traffic_split=data.traffic_split,
            min_sample_size=data.min_sample_size,
        )
        self.db.add(experiment)
        await self.db.commit()
        await self.db.refresh(experiment)
        return experiment

    async def get_experiment(self, experiment_id: str) -> ABTestExperiment:
        """Get a single experiment by ID."""
        experiment = await self.db.get(ABTestExperiment, experiment_id)
        if experiment is None:
            raise ValueError(f"Experiment not found: {experiment_id}")
        return experiment

    async def list_experiments(
        self,
        agent_id: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> ExperimentListResponse:
        """List experiments with optional agent filter."""
        query = select(ABTestExperiment)
        count_query = select(func.count(ABTestExperiment.id))

        if agent_id:
            query = query.where(ABTestExperiment.agent_id == agent_id)
            count_query = count_query.where(ABTestExperiment.agent_id == agent_id)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(ABTestExperiment.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        experiments = result.scalars().all()

        return ExperimentListResponse(
            items=[ExperimentResponse.model_validate(e) for e in experiments],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def start_experiment(self, experiment_id: str) -> ABTestExperiment:
        """Start an experiment (activate traffic routing)."""
        experiment = await self.get_experiment(experiment_id)
        if experiment.status not in (ExperimentStatus.DRAFT, ExperimentStatus.PAUSED):
            raise ValueError(f"Cannot start experiment with status: {experiment.status.value}")

        experiment.status = ExperimentStatus.RUNNING
        experiment.started_at = utcnow()
        await self.db.commit()

        # Invalidate cache AFTER commit
        from .ab_testing import ABTestRouter

        router = ABTestRouter(self.db)
        await router.invalidate_cache(experiment.agent_id)

        return experiment

    async def stop_experiment(self, experiment_id: str) -> ABTestExperiment:
        """Stop an experiment."""
        experiment = await self.get_experiment(experiment_id)
        experiment.status = ExperimentStatus.COMPLETED
        experiment.completed_at = utcnow()
        await self.db.commit()

        # Invalidate cache AFTER commit
        from .ab_testing import ABTestRouter

        router = ABTestRouter(self.db)
        await router.invalidate_cache(experiment.agent_id)

        return experiment

    # -----------------------------------------------------------------------
    # Agent fine-tuning config
    # -----------------------------------------------------------------------

    async def get_agent_ft_config(
        self, agent_id: str
    ) -> AgentFineTuningConfig | None:
        """Get per-agent fine-tuning config."""
        return await self.db.get(AgentFineTuningConfig, agent_id)

    async def update_agent_ft_config(
        self, agent_id: str, update: AgentFineTuningConfigUpdate
    ) -> AgentFineTuningConfig:
        """Create or update per-agent fine-tuning config."""
        config = await self.db.get(AgentFineTuningConfig, agent_id)
        if config is None:
            config = AgentFineTuningConfig(agent_id=agent_id)
            self.db.add(config)

        for field_name, value in update.model_dump(exclude_unset=True).items():
            setattr(config, field_name, value)

        config.updated_at = utcnow()
        await self.db.commit()
        await self.db.refresh(config)
        return config

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _count_active_openai_jobs(self) -> int:
        """Count currently active OpenAI fine-tuning jobs."""
        query = select(func.count(FineTuningJob.id)).where(
            and_(
                FineTuningJob.provider == JobProvider.OPENAI,
                FineTuningJob.status.in_(
                    [JobStatus.VALIDATING, JobStatus.TRAINING]
                ),
            )
        )
        result = await self.db.execute(query)
        return result.scalar() or 0
