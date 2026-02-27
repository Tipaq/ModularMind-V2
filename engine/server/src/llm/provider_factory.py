"""LLM Provider Factory for the runtime.

Selects the appropriate LLM provider based on configuration (LLM_PROVIDER setting).
Supports Ollama, vLLM, TGI, and auto-detection modes.

vLLM and TGI both expose OpenAI-compatible /v1/chat/completions APIs,
so we reuse OpenAIProvider with a custom base_url.
"""

import logging

from .base import LLMProvider
from .anthropic import AnthropicProvider
from .ollama import OllamaProvider
from .openai import OpenAIProvider

from src.infra.config import get_settings

logger = logging.getLogger(__name__)

# Singleton provider instance (set on first call)
_provider: LLMProvider | None = None


class VLLMProvider(OpenAIProvider):
    """vLLM provider — wraps OpenAI-compatible API served by vLLM."""

    def __init__(self, base_url: str, timeout: float = 120.0):
        super().__init__(
            api_key="EMPTY",  # vLLM doesn't require a real key
            base_url=base_url,
            timeout=timeout,
        )

    @property
    def provider_name(self) -> str:
        return "vllm"


class TGIProvider(OpenAIProvider):
    """TGI provider — wraps OpenAI-compatible API served by TGI."""

    def __init__(self, base_url: str, timeout: float = 120.0):
        super().__init__(
            api_key="EMPTY",  # TGI doesn't require a real key
            base_url=base_url,
            timeout=timeout,
        )

    @property
    def provider_name(self) -> str:
        return "tgi"


class LLMProviderFactory:
    """Factory for creating LLM providers based on runtime configuration."""

    @staticmethod
    def get_provider(provider_name: str | None = None) -> LLMProvider:
        """Get an LLM provider instance.

        Args:
            provider_name: Provider name override. If None, reads from config.
                Supported: "ollama", "vllm", "tgi", "auto"

        Returns:
            An LLMProvider instance.

        Raises:
            ValueError: If the provider is not recognized or required URL is missing.
        """
        settings = get_settings()
        name = provider_name or settings.LLM_PROVIDER
        timeout = float(settings.LLM_CALL_TIMEOUT)

        if name == "auto":
            name = auto_select_provider()

        if name == "ollama":
            return OllamaProvider(
                base_url=settings.OLLAMA_BASE_URL,
                timeout=timeout,
            )

        if name == "vllm":
            if not settings.VLLM_BASE_URL:
                raise ValueError(
                    "LLM_PROVIDER=vllm but VLLM_BASE_URL is not set. "
                    "Set VLLM_BASE_URL to the vLLM server address."
                )
            return VLLMProvider(
                base_url=settings.VLLM_BASE_URL,
                timeout=timeout,
            )

        if name == "tgi":
            if not settings.TGI_BASE_URL:
                raise ValueError(
                    "LLM_PROVIDER=tgi but TGI_BASE_URL is not set. "
                    "Set TGI_BASE_URL to the TGI server address."
                )
            return TGIProvider(
                base_url=settings.TGI_BASE_URL,
                timeout=timeout,
            )

        # Standard providers (openai, anthropic)
        _STANDARD: dict[str, type[LLMProvider]] = {
            "openai": OpenAIProvider,
            "anthropic": AnthropicProvider,
        }
        provider_class = _STANDARD.get(name)
        if not provider_class:
            available = ["ollama", "vllm", "tgi"] + list(_STANDARD.keys())
            raise ValueError(f"Unknown provider: {name}. Available: {', '.join(available)}")
        return provider_class()


def auto_select_provider() -> str:
    """Auto-detect the best provider based on GPU availability and config.

    Returns:
        Selected provider name string.
    """
    from src.infra.gpu import detect_gpu

    settings = get_settings()
    gpu = detect_gpu()

    if gpu.available:
        if settings.VLLM_BASE_URL:
            logger.info(
                "Auto-selected provider: vllm (GPU detected: %s, %d device(s))",
                gpu.type,
                gpu.device_count,
            )
            return "vllm"
        if settings.TGI_BASE_URL:
            logger.info(
                "Auto-selected provider: tgi (GPU detected: %s, %d device(s))",
                gpu.type,
                gpu.device_count,
            )
            return "tgi"

    logger.info(
        "Auto-selected provider: ollama (GPU available=%s, VLLM_BASE_URL=%s, TGI_BASE_URL=%s)",
        gpu.available,
        bool(settings.VLLM_BASE_URL),
        bool(settings.TGI_BASE_URL),
    )
    return "ollama"


def get_runtime_llm_provider(provider_name: str | None = None) -> LLMProvider:
    """Get the runtime LLM provider (cached singleton).

    On first call, creates the provider based on config. Subsequent calls
    return the same instance.

    Args:
        provider_name: Optional override. Pass None to use config.

    Returns:
        The cached LLMProvider instance.
    """
    global _provider
    if _provider is None:
        _provider = LLMProviderFactory.get_provider(provider_name)
        logger.info("Runtime LLM provider initialized: %s", _provider.provider_name)
    return _provider
