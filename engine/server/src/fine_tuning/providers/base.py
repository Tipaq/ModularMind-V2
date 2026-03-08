"""
Fine-tuning provider abstraction.

Abstract base class defining the interface for fine-tuning providers.
"""

from abc import ABC, abstractmethod


class FineTuningProvider(ABC):
    """Abstract base class for fine-tuning providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name (e.g., 'openai', 'local_export')."""
        ...

    @abstractmethod
    async def upload_dataset(self, file_path: str) -> str:
        """Upload a dataset file to the provider.

        Returns:
            Provider-specific file ID (e.g., OpenAI file ID or local path).
        """
        ...

    @abstractmethod
    async def create_job(self, file_id: str, base_model: str, hyperparameters: dict) -> str:
        """Create a fine-tuning job.

        Returns:
            Provider-specific job ID.
        """
        ...

    @abstractmethod
    async def get_job_status(self, job_id: str) -> dict:
        """Get the current status and metrics of a fine-tuning job.

        Returns:
            Dict with keys: status, fine_tuned_model (if complete),
            trained_tokens, error (if failed).
        """
        ...

    @abstractmethod
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a running fine-tuning job.

        Returns:
            True if cancelled successfully.
        """
        ...

    @abstractmethod
    async def list_jobs(self) -> list[dict]:
        """List recent fine-tuning jobs from the provider.

        Returns:
            List of job status dicts.
        """
        ...
