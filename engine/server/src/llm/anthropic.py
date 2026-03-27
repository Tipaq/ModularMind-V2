"""
Anthropic LLM Provider.

Supports three auth modes (in priority order):
1. OAuth token from CLAUDE_HOME/.credentials.json (Max subscription)
2. API key from SecretsStore or ANTHROPIC_API_KEY env var
3. Claude Bridge sidecar (fallback, no tool calling support)
"""

import json
import logging
from pathlib import Path
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


def _read_oauth_token(claude_home: str) -> str | None:
    """Read OAuth access token from CLAUDE_HOME/.credentials.json."""
    credentials_path = Path(claude_home) / ".credentials.json"
    if not credentials_path.exists():
        return None
    try:
        data = json.loads(credentials_path.read_text(encoding="utf-8"))
        token = data.get("claudeAiOauth", {}).get("accessToken")
        if token:
            logger.debug("Resolved OAuth token from %s", credentials_path)
        return token
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to read OAuth credentials from %s: %s", credentials_path, e)
        return None


class AnthropicProvider(LLMProvider):
    """Anthropic provider for Claude models.

    Auth resolution order:
    1. OAuth token from CLAUDE_HOME credentials (uses Authorization: Bearer)
    2. API key from SecretsStore or env (uses x-api-key)
    3. Claude Bridge sidecar (CLI-based, no tool support)
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

    def _resolve_oauth_token(self) -> str | None:
        from src.infra.config import get_settings
        claude_home = get_settings().CLAUDE_HOME
        if not claude_home:
            return None
        return _read_oauth_token(claude_home)

    def _resolve_api_key(self) -> str | None:
        if self.api_key:
            return self.api_key
        from src.infra.secrets import secrets_store
        key = secrets_store.get("ANTHROPIC_API_KEY")
        if key:
            return key
        import os
        return os.environ.get("ANTHROPIC_API_KEY")

    async def get_model(
        self,
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> BaseChatModel:
        _, model_name = self.parse_model_id(model_id)

        # 1. Try OAuth token (Max subscription — full tool calling support)
        oauth_token = self._resolve_oauth_token()
        if oauth_token:
            logger.info("Using OAuth token for model %s", model_name)
            return ChatAnthropic(
                model=model_name,
                api_key="placeholder",
                default_headers={"Authorization": f"Bearer {oauth_token}"},
                base_url=self.base_url,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=self.timeout,
                max_retries=self.max_retries,
                **kwargs,
            )

        # 2. Try API key
        api_key = self._resolve_api_key()
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

        # 3. Fallback to bridge (no tool calling)
        from .bridge_exec import is_bridge_available
        if await is_bridge_available():
            from .claude_bridge import ChatClaudeBridge
            return ChatClaudeBridge(model_name=model_name)

        raise ValueError(
            "No Anthropic auth found — set CLAUDE_HOME, ANTHROPIC_API_KEY, "
            "or start the Claude Bridge sidecar"
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
        if self._resolve_oauth_token():
            return True
        if self._resolve_api_key():
            return True
        from .bridge_exec import is_bridge_available
        return await is_bridge_available()
