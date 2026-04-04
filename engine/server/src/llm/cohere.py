"""Cohere LLM Provider via OpenAI-compatible API."""

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

COHERE_BASE_URL = "https://api.cohere.com/v2"

COHERE_MODELS = {
    "command-r-plus": {"name": "Command R+", "context_length": 128000},
    "command-r": {"name": "Command R", "context_length": 128000},
    "command": {"name": "Command", "context_length": 4096},
}


def _resolve_api_key(explicit_key: str | None = None) -> str:
    if explicit_key:
        return explicit_key
    try:
        from src.infra.secrets import secrets_store

        key = secrets_store.get("COHERE_API_KEY")
        if key:
            return key
    except Exception:
        pass
    import os

    return os.environ.get("COHERE_API_KEY", "")


class CohereProvider(LLMProvider):
    """Cohere provider via OpenAI-compatible API."""

    def __init__(self, api_key: str | None = None, timeout: float = 60.0):
        self.api_key = _resolve_api_key(api_key)
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "cohere"

    async def get_model(self, model_name: str, **kwargs: Any) -> BaseChatModel:
        temperature = kwargs.pop("temperature", 0.7)
        kwargs.pop("format", None)

        return ChatOpenAI(
            model=model_name,
            api_key=self.api_key,
            base_url=COHERE_BASE_URL,
            temperature=temperature,
            timeout=self.timeout,
        )

    async def list_models(self) -> list[ModelInfo]:
        return [
            ModelInfo(name=info["name"], context_length=info["context_length"])
            for info in COHERE_MODELS.values()
        ]

    async def is_available(self) -> bool:
        return bool(self.api_key)

    def get_model_info(self, model_name: str) -> ModelInfo:
        info = COHERE_MODELS.get(model_name, {})
        return ModelInfo(
            name=info.get("name", model_name),
            context_length=info.get("context_length", 128000),
        )
