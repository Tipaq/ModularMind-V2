"""
OpenAI LLM Provider.

Integrates with OpenAI API for GPT models.
"""

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

# Known OpenAI models with context lengths
OPENAI_MODELS = {
    "gpt-4o": {"name": "GPT-4o", "context_length": 128000},
    "gpt-4o-mini": {"name": "GPT-4o Mini", "context_length": 128000},
    "gpt-4-turbo": {"name": "GPT-4 Turbo", "context_length": 128000},
    "gpt-4": {"name": "GPT-4", "context_length": 8192},
    "gpt-3.5-turbo": {"name": "GPT-3.5 Turbo", "context_length": 16385},
}


class OpenAIProvider(LLMProvider):
    """OpenAI provider for GPT models.

    Uses the OpenAI API for running GPT-4, GPT-3.5, and other models.
    Requires an API key.
    """

    def __init__(
        self,
        api_key: str | None = None,
        organization: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
    ):
        """Initialize OpenAI provider.

        Args:
            api_key: OpenAI API key (or set OPENAI_API_KEY env var)
            organization: Optional organization ID
            base_url: Optional custom base URL (for Azure or proxies)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.organization = organization
        self.base_url = base_url
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "openai"

    async def get_model(
        self,
        model_id: str,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> BaseChatModel:
        """Get an OpenAI chat model.

        Args:
            model_id: Model name (e.g., "gpt-4o" or "openai:gpt-4o")
            temperature: Sampling temperature
            **kwargs: Additional model parameters

        Returns:
            ChatOpenAI instance
        """
        _, model_name = self.parse_model_id(model_id)

        return ChatOpenAI(
            model=model_name,
            api_key=self.api_key,
            organization=self.organization,
            base_url=self.base_url,
            temperature=temperature,
            timeout=self.timeout,
            **kwargs,
        )

    async def list_models(self) -> list[ModelInfo]:
        """List available OpenAI models.

        Returns:
            List of known OpenAI models
        """
        models = []
        for model_id, info in OPENAI_MODELS.items():
            models.append(
                ModelInfo(
                    id=f"openai:{model_id}",
                    name=info["name"],
                    provider="openai",
                    context_length=info["context_length"],
                )
            )
        return models

    async def is_available(self) -> bool:
        """Check if OpenAI API is accessible.

        Returns:
            True if API key is set (doesn't make actual API call)
        """
        # Check if API key is available
        if self.api_key:
            return True

        # Check environment variable
        import os

        return bool(os.environ.get("OPENAI_API_KEY"))
