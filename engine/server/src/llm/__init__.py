"""LLM module - Language model providers and runtime factory."""

from typing import Any

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



__all__ = [
    "LLMProvider",
    "ModelInfo",
    "OllamaProvider",
    "OpenAIProvider",
    "AnthropicProvider",
    "VLLMProvider",
    "TGIProvider",
    "LLMProviderFactory",
    "get_llm_provider",
    "get_runtime_llm_provider",
]
