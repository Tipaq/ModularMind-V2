"""Google Gemini LLM Provider.

Uses Google's OpenAI-compatible API for Gemini models.
Free tier available for gemini-2.0-flash and other models.
"""

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"

GEMINI_MODELS = {
    "gemini-2.0-flash": {"name": "Gemini 2.0 Flash", "context_length": 1048576},
    "gemini-2.5-flash": {"name": "Gemini 2.5 Flash", "context_length": 1048576},
    "gemini-2.5-pro": {"name": "Gemini 2.5 Pro", "context_length": 1048576},
}


class GeminiProvider(LLMProvider):
    """Google Gemini provider via OpenAI-compatible API."""

    def __init__(self, api_key: str | None = None, timeout: float = 60.0):
        if not api_key:
            from src.infra.secrets import secrets_store

            api_key = secrets_store.get("GOOGLE_API_KEY")
        if not api_key:
            import os

            api_key = os.environ.get("GOOGLE_API_KEY", "")

        self.api_key = api_key
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "google"

    async def get_model(self, model_name: str, **kwargs: Any) -> BaseChatModel:
        temperature = kwargs.pop("temperature", 0.7)
        json_mode = kwargs.pop("format", None) == "json"

        model_kwargs: dict[str, Any] = {}
        if json_mode:
            model_kwargs["response_format"] = {"type": "json_object"}

        return ChatOpenAI(
            model=model_name,
            api_key=self.api_key,
            base_url=GEMINI_BASE_URL,
            temperature=temperature,
            timeout=self.timeout,
            model_kwargs=model_kwargs,
        )

    def get_model_info(self, model_name: str) -> ModelInfo:
        info = GEMINI_MODELS.get(model_name, {})
        return ModelInfo(
            name=info.get("name", model_name),
            context_length=info.get("context_length", 1048576),
        )
