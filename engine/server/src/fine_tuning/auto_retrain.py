"""
Auto-retrain module.

Checks per-agent feedback thresholds and triggers automatic
dataset generation + fine-tuning jobs when thresholds are met.
"""

from __future__ import annotations

import logging

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.executions.feedback import ExecutionFeedback
from src.fine_tuning.models import (
    AgentFineTuningConfig,
    FineTuningJob,
    JobStatus,
)

logger = logging.getLogger(__name__)


class AutoRetrainChecker:
    """Checks all agents for auto-retrain eligibility."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def check_and_trigger(self) -> list[str]:
        """Check all agents and trigger retraining where needed.

        Returns:
            List of triggered job IDs.
        """
        agents = await self._get_agents_needing_retrain()
        triggered_jobs: list[str] = []

        for agent_info in agents:
            try:
                job_id = await self._trigger_retrain(agent_info)
                if job_id:
                    triggered_jobs.append(job_id)
            except Exception:
                logger.exception(
                    "Failed to trigger retrain for agent %s",
                    agent_info["agent_id"],
                )

        if triggered_jobs:
            logger.info(
                "Auto-retrain triggered %d jobs: %s",
                len(triggered_jobs),
                triggered_jobs,
            )

        return triggered_jobs

    async def _get_agents_needing_retrain(self) -> list[dict]:
        """Find agents with auto-retrain enabled whose feedback threshold is met."""
        # Get all agents with auto-retrain enabled
        configs_query = select(AgentFineTuningConfig).where(
            AgentFineTuningConfig.auto_retrain_enabled.is_(True)
        )
        result = await self.db.execute(configs_query)
        configs = result.scalars().all()

        agents_needing_retrain: list[dict] = []

        for config in configs:
            # Find the last completed job for this agent
            last_job_query = (
                select(FineTuningJob.created_at)
                .where(
                    and_(
                        FineTuningJob.agent_id == config.agent_id,
                        FineTuningJob.status == JobStatus.COMPLETED,
                    )
                )
                .order_by(FineTuningJob.created_at.desc())
                .limit(1)
            )
            last_job_result = await self.db.execute(last_job_query)
            last_job_date = last_job_result.scalar_one_or_none()

            # Count feedback with corrections since last job
            feedback_query = select(func.count(ExecutionFeedback.id)).where(
                and_(
                    ExecutionFeedback.agent_id == config.agent_id,
                    ExecutionFeedback.correction.isnot(None),
                )
            )
            if last_job_date:
                feedback_query = feedback_query.where(
                    ExecutionFeedback.created_at > last_job_date
                )

            feedback_result = await self.db.execute(feedback_query)
            feedback_count = feedback_result.scalar() or 0

            if feedback_count >= config.auto_retrain_threshold:
                agents_needing_retrain.append(
                    {
                        "agent_id": config.agent_id,
                        "feedback_count": feedback_count,
                        "threshold": config.auto_retrain_threshold,
                        "base_model": config.default_base_model,
                        "provider": config.default_provider or "openai",
                    }
                )
                logger.info(
                    "Agent %s eligible for auto-retrain: %d corrections >= threshold %d",
                    config.agent_id,
                    feedback_count,
                    config.auto_retrain_threshold,
                )

        return agents_needing_retrain

    async def _trigger_retrain(self, agent_info: dict) -> str | None:
        """Create dataset and trigger fine-tuning job for an agent."""
        # Lazy import to avoid circular dependency
        from src.fine_tuning.models import JobProvider
        from src.fine_tuning.schemas import DatasetCreate, DatasetFilters, JobCreate
        from src.fine_tuning.service import FineTuningService

        service = FineTuningService(self.db)
        agent_id = agent_info["agent_id"]

        # Create auto-generated dataset
        dataset = await service.create_dataset(
            DatasetCreate(
                agent_id=agent_id,
                name=f"auto-retrain-{agent_id[:8]}",
                description=f"Auto-generated dataset ({agent_info['feedback_count']} corrections)",
                filters=DatasetFilters(min_rating=4),
                format="openai_chat",
            ),
            user_id="system",
        )

        # Create job (respects FINETUNING_MAX_CONCURRENT_JOBS)
        if agent_info.get("base_model"):
            provider = JobProvider(agent_info.get("provider", "openai"))
            job = await service.create_job(
                JobCreate(
                    dataset_id=dataset.id,
                    provider=provider,
                    base_model=agent_info["base_model"],
                ),
                user_id="system",
            )
            return job.id

        logger.warning(
            "Agent %s has no default_base_model configured, skipping auto-retrain",
            agent_id,
        )
        return None
