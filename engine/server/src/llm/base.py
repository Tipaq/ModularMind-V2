"""
LLM Provider Base Class.

Defines the interface for LLM providers.
"""

from abc import ABC, abstractmethod
from typing import Any

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel


class ModelInfo(BaseModel):
    """Information about an available model."""

    id: str
    name: str
    provider: str
    size: str | None = None
    family: str | None = None
    quantization: str | None = None
    context_length: int | None = None


class LLMProvider(ABC):
    """Abstract base class for LLM providers.

    All LLM providers must implement this interface to be usable
    with the ModularMind execution system.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Get the provider name (e.g., 'ollama', 'openai')."""
        ...

    @abstractmethod
    async def get_model(self, model_id: str, **kwargs: Any) -> BaseChatModel:
        """Get a chat model instance.

        Args:
            model_id: The model identifier (e.g., "llama3.2" for ollama, "gpt-4" for openai)
            **kwargs: Additional model configuration

        Returns:
            A LangChain chat model instance
        """
        ...

    @abstractmethod
    async def list_models(self) -> list[ModelInfo]:
        """List available models.

        Returns:
            List of available model information
        """
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the provider is available.

        Returns:
            True if the provider is accessible
        """
        ...

    def parse_model_id(self, full_model_id: str) -> tuple[str, str]:
        """Parse a full model ID into provider and model parts.

        Uses the shared KNOWN_PROVIDERS set from infra.constants.
        Falls back to this provider's name when no known prefix is found.
        """
        from src.infra.constants import KNOWN_PROVIDERS

        if ":" in full_model_id:
            prefix, rest = full_model_id.split(":", 1)
            if prefix.lower() in KNOWN_PROVIDERS:
                return prefix, rest
        return self.provider_name, full_model_id
