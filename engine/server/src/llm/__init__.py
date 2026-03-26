"""LLM module - Language model providers and runtime factory."""

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel

from .anthropic import AnthropicProvider
from .base import LLMProvider, ModelInfo
from .ollama import OllamaProvider
from .openai import OpenAIProvider
from .provider_factory import (
    LLMProviderFactory,
    TGIProvider,
    VLLMProvider,
    get_runtime_llm_provider,
)

logger = logging.getLogger(__name__)

# Registry of available providers
_PROVIDERS: dict[str, type[LLMProvider]] = {
    "ollama": OllamaProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
}


def get_llm_provider(provider_name: str, **kwargs: Any) -> LLMProvider:
    """Factory function to get an LLM provider by name.

    Args:
        provider_name: Type of provider ("ollama", "openai", "anthropic")
        **kwargs: Provider-specific configuration

    Returns:
        An LLM provider instance

    Raises:
        ValueError: If provider_name is not recognized
    """
    provider_class = _PROVIDERS.get(provider_name)
    if not provider_class:
        available = ", ".join(_PROVIDERS.keys())
        raise ValueError(f"Unknown provider: {provider_name}. Available: {available}")

    return provider_class(**kwargs)


class RoutingLLMProvider:
    """Routes get_model() calls to the correct provider based on model_id prefix.

    Parses 'provider:model' IDs and delegates to the matching provider.
    Falls back to the default provider when no known prefix is found.
    """

    def __init__(self, default_provider: LLMProvider):
        self._default = default_provider
        self._cache: dict[str, LLMProvider] = {}

    def _resolve_provider(self, model_id: str) -> tuple[LLMProvider, str]:
        from src.infra.constants import KNOWN_PROVIDERS

        if ":" in model_id:
            prefix, rest = model_id.split(":", 1)
            if prefix.lower() in KNOWN_PROVIDERS and prefix.lower() in _PROVIDERS:
                provider_name = prefix.lower()
                if provider_name == self._default.provider_name:
                    return self._default, rest
                if provider_name not in self._cache:
                    kwargs: dict[str, Any] = {}
                    if provider_name == "ollama":
                        from src.infra.config import get_settings
                        kwargs["base_url"] = get_settings().OLLAMA_BASE_URL
                    self._cache[provider_name] = _PROVIDERS[provider_name](**kwargs)
                return self._cache[provider_name], rest
        return self._default, model_id

    async def get_model(self, model_id: str, **kwargs: Any) -> BaseChatModel:
        provider, bare_model_id = self._resolve_provider(model_id)
        logger.debug("Routing model %s → %s (%s)", model_id, provider.provider_name, bare_model_id)
        return await provider.get_model(bare_model_id, **kwargs)


__all__ = [
    "LLMProvider",
    "ModelInfo",
    "OllamaProvider",
    "OpenAIProvider",
    "AnthropicProvider",
    "VLLMProvider",
    "TGIProvider",
    "LLMProviderFactory",
    "RoutingLLMProvider",
    "get_llm_provider",
    "get_runtime_llm_provider",
]
