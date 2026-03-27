"""
Anthropic LLM Provider.

Two modes:
1. Claude Code Max — Bridge CLI sidecar (free, tools via internal MCP)
2. API key — ChatAnthropic (paid, native tool calling)

Bridge is preferred when available. Tool calling is supported in both
modes: Bridge uses the internal MCP server, API uses native tool_use.
"""

import logging
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

ANTHROPIC_MODELS = {
    "claude-opus-4-6": {"name": "Claude Opus 4.6", "context_length": 1000000},
    "claude-sonnet-4-6": {"name": "Claude Sonnet 4.6", "context_length": 1000000},
    "claude-opus-4-5-20251101": {"name": "Claude Opus 4.5", "context_length": 200000},
    "claude-sonnet-4-5-20250929": {"name": "Claude Sonnet 4.5", "context_length": 1000000},
    "claude-haiku-4-5-20251001": {"name": "Claude Haiku 4.5", "context_length": 200000},
    "claude-opus-4-20250514": {"name": "Claude Opus 4", "context_length": 200000},
    "claude-sonnet-4-20250514": {"name": "Claude Sonnet 4", "context_length": 1000000},
}


def _resolve_api_key(explicit_key: str | None = None) -> str | None:
    """Resolve Anthropic API key from explicit, SecretsStore, or env."""
    if explicit_key:
        return explicit_key
    try:
        from src.infra.secrets import secrets_store

        key = secrets_store.get("ANTHROPIC_API_KEY")
        if key:
            return key
    except Exception:
        pass
    import os

    return os.environ.get("ANTHROPIC_API_KEY")


class AnthropicProvider(LLMProvider):
    """Anthropic provider.

    Priority: Bridge CLI (Max) > API key (paid).
    Both modes support tools: Bridge via internal MCP, API via native tool_use.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
        max_retries: int = 2,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries

    @property
    def provider_name(self) -> str:
        return "anthropic"

    async def get_model(
        self,
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> BaseChatModel:
        _, model_name = self.parse_model_id(model_id)

        # 1. Bridge CLI (Claude Max — free, tools via MCP)
        from .bridge_exec import is_bridge_available

        if await is_bridge_available():
            from .claude_bridge import ChatClaudeBridge

            logger.info("Anthropic: using Bridge CLI for %s", model_name)
            return ChatClaudeBridge(model_name=model_name)

        # 2. API key (paid, full tool support)
        api_key = _resolve_api_key(self.api_key)
        if api_key:
            return ChatAnthropic(
                model=model_name,
                api_key=api_key,
                base_url=self.base_url,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=self.timeout,
                max_retries=self.max_retries,
                **kwargs,
            )

        raise ValueError(
            "No Anthropic auth — start the Claude Bridge sidecar "
            "or set ANTHROPIC_API_KEY"
        )

    async def list_models(self) -> list[ModelInfo]:
        return [
            ModelInfo(
                id=f"anthropic:{model_id}",
                name=info["name"],
                provider="anthropic",
                context_length=info["context_length"],
            )
            for model_id, info in ANTHROPIC_MODELS.items()
        ]

    async def is_available(self) -> bool:
        from .bridge_exec import is_bridge_available

        if await is_bridge_available():
            return True
        return bool(_resolve_api_key(self.api_key))
