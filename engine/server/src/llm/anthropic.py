"""
Anthropic LLM Provider.

Integrates with Anthropic API for Claude models.
"""

import logging
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

# Known Anthropic models with context lengths
ANTHROPIC_MODELS = {
    "claude-opus-4-6": {"name": "Claude Opus 4.6", "context_length": 1000000},
    "claude-sonnet-4-6": {"name": "Claude Sonnet 4.6", "context_length": 1000000},
    "claude-opus-4-5-20251101": {"name": "Claude Opus 4.5", "context_length": 200000},
    "claude-sonnet-4-5-20250929": {"name": "Claude Sonnet 4.5", "context_length": 1000000},
    "claude-haiku-4-5-20251001": {"name": "Claude Haiku 4.5", "context_length": 200000},
    "claude-opus-4-20250514": {"name": "Claude Opus 4", "context_length": 200000},
    "claude-sonnet-4-20250514": {"name": "Claude Sonnet 4", "context_length": 1000000},
}


class AnthropicProvider(LLMProvider):
    """Anthropic provider for Claude models.

    Uses the Anthropic API for running Claude models.
    Requires an API key.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
        max_retries: int = 2,
    ):
        """Initialize Anthropic provider.

        Args:
            api_key: Anthropic API key (or set ANTHROPIC_API_KEY env var)
            base_url: Optional custom base URL
            timeout: Request timeout in seconds
            max_retries: Maximum number of retries on failure
        """
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "anthropic"

    async def get_model(
        self,
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> BaseChatModel:
        """Get an Anthropic chat model.

        Args:
            model_id: Model name (e.g., "claude-3-5-sonnet-20241022")
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
            **kwargs: Additional model parameters

        Returns:
            ChatAnthropic instance
        """
        _, model_name = self.parse_model_id(model_id)

        return ChatAnthropic(
            model=model_name,
            api_key=self.api_key,
            base_url=self.base_url,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=self.timeout,
            max_retries=self.max_retries,
            **kwargs,
        )

    async def list_models(self) -> list[ModelInfo]:
        """List available Anthropic models.

        Returns:
            List of known Anthropic models
        """
        models = []
        for model_id, info in ANTHROPIC_MODELS.items():
            models.append(
                ModelInfo(
                    id=f"anthropic:{model_id}",
                    name=info["name"],
                    provider="anthropic",
                    context_length=info["context_length"],
                )
            )
        return models

    async def is_available(self) -> bool:
        """Check if Anthropic API is accessible.

        Returns:
            True if API key is set (doesn't make actual API call)
        """
        if self.api_key:
            return True

        import os

        return bool(os.environ.get("ANTHROPIC_API_KEY"))
