"""Groq LLM Provider via OpenAI-compatible API."""

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

GROQ_MODELS = {
    "llama-3.3-70b-versatile": {"name": "Llama 3.3 70B", "context_length": 128000},
    "llama-3.1-8b-instant": {"name": "Llama 3.1 8B", "context_length": 128000},
    "mixtral-8x7b-32768": {"name": "Mixtral 8x7B", "context_length": 32768},
    "gemma2-9b-it": {"name": "Gemma 2 9B", "context_length": 8192},
}


def _resolve_api_key(explicit_key: str | None = None) -> str:
    if explicit_key:
        return explicit_key
    try:
        from src.infra.secrets import secrets_store

        key = secrets_store.get("GROQ_API_KEY")
        if key:
            return key
    except Exception:
        pass
    import os

    return os.environ.get("GROQ_API_KEY", "")


class GroqProvider(LLMProvider):
    """Groq provider via OpenAI-compatible API."""

    def __init__(self, api_key: str | None = None, timeout: float = 60.0):
        self.api_key = _resolve_api_key(api_key)
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "groq"

    async def get_model(self, model_name: str, **kwargs: Any) -> BaseChatModel:
        temperature = kwargs.pop("temperature", 0.7)
        json_mode = kwargs.pop("format", None) == "json"

        model_kwargs: dict[str, Any] = {}
        if json_mode:
            model_kwargs["response_format"] = {"type": "json_object"}

        return ChatOpenAI(
            model=model_name,
            api_key=self.api_key,
            base_url=GROQ_BASE_URL,
            temperature=temperature,
            timeout=self.timeout,
            model_kwargs=model_kwargs,
        )

    def get_model_info(self, model_name: str) -> ModelInfo:
        info = GROQ_MODELS.get(model_name, {})
        return ModelInfo(
            name=info.get("name", model_name),
            context_length=info.get("context_length", 128000),
        )
