"""
OpenAI fine-tuning provider.

Implements fine-tuning via the OpenAI API (files.create, fine_tuning.jobs.*).
"""

from __future__ import annotations

import logging

from openai import AsyncOpenAI, PermissionDeniedError

from src.fine_tuning.models import JobStatus

from .base import FineTuningProvider

logger = logging.getLogger(__name__)

# Map OpenAI job statuses → internal JobStatus
_OPENAI_STATUS_MAP: dict[str, JobStatus] = {
    "validating_files": JobStatus.VALIDATING,
    "queued": JobStatus.PENDING,
    "running": JobStatus.TRAINING,
    "succeeded": JobStatus.COMPLETED,
    "failed": JobStatus.FAILED,
    "cancelled": JobStatus.CANCELLED,
}


class OpenAIFineTuningProvider(FineTuningProvider):
    """Fine-tuning via the OpenAI API."""

    def __init__(self, api_key: str):
        self._client = AsyncOpenAI(api_key=api_key)

    @property
    def provider_name(self) -> str:
        return "openai"

    async def upload_dataset(self, file_path: str) -> str:
        """Upload JSONL file to OpenAI for fine-tuning."""
        try:
            with open(file_path, "rb") as f:
                response = await self._client.files.create(
                    file=f, purpose="fine-tune"
                )
            logger.info("Uploaded dataset to OpenAI: file_id=%s", response.id)
            return response.id
        except PermissionDeniedError:
            raise PermissionError(
                "Your OpenAI API key does not have fine-tuning permissions. "
                "Generate a key with 'Fine-tuning' scope at platform.openai.com/api-keys."
            )

    async def create_job(
        self, file_id: str, base_model: str, hyperparameters: dict
    ) -> str:
        """Create an OpenAI fine-tuning job."""
        hp = {}
        if "n_epochs" in hyperparameters:
            hp["n_epochs"] = hyperparameters["n_epochs"]
        if "learning_rate_multiplier" in hyperparameters:
            hp["learning_rate_multiplier"] = hyperparameters[
                "learning_rate_multiplier"
            ]
        if "batch_size" in hyperparameters and hyperparameters["batch_size"] != "auto":
            hp["batch_size"] = hyperparameters["batch_size"]

        kwargs: dict = {
            "training_file": file_id,
            "model": base_model,
        }
        if hp:
            kwargs["hyperparameters"] = hp
        if hyperparameters.get("suffix"):
            kwargs["suffix"] = hyperparameters["suffix"]

        try:
            job = await self._client.fine_tuning.jobs.create(**kwargs)
            logger.info("Created OpenAI fine-tuning job: %s", job.id)
            return job.id
        except PermissionDeniedError:
            raise PermissionError(
                "Your OpenAI API key does not have fine-tuning permissions. "
                "Generate a key with 'Fine-tuning' scope at platform.openai.com/api-keys."
            )

    async def get_job_status(self, job_id: str) -> dict:
        """Get status of an OpenAI fine-tuning job."""
        job = await self._client.fine_tuning.jobs.retrieve(job_id)
        return {
            "status": _OPENAI_STATUS_MAP.get(job.status, JobStatus.PENDING).value,
            "fine_tuned_model": job.fine_tuned_model,
            "trained_tokens": job.trained_tokens,
            "result_files": job.result_files,
            "error": job.error.message if job.error else None,
        }

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a running OpenAI fine-tuning job."""
        try:
            await self._client.fine_tuning.jobs.cancel(job_id)
            logger.info("Cancelled OpenAI fine-tuning job: %s", job_id)
            return True
        except Exception:
            logger.exception("Failed to cancel OpenAI job %s", job_id)
            return False

    async def list_jobs(self) -> list[dict]:
        """List recent OpenAI fine-tuning jobs."""
        result = await self._client.fine_tuning.jobs.list(limit=20)
        return [
            {
                "id": j.id,
                "status": _OPENAI_STATUS_MAP.get(j.status, JobStatus.PENDING).value,
                "model": j.model,
                "fine_tuned_model": j.fine_tuned_model,
                "created_at": j.created_at,
            }
            for j in result.data
        ]
