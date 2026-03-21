"""
Ollama LLM Provider.

Integrates with locally running Ollama for local LLM inference.
"""

import logging
from typing import Any

import httpx
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)


class OllamaProvider(LLMProvider):
    """Ollama provider for local LLM inference."""

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        timeout: float = 120.0,
    ):
        self.base_url = base_url
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
            )
        return self._client

    @property
    def provider_name(self) -> str:
        return "ollama"

    async def get_model(
        self,
        model_id: str,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> BaseChatModel:
        _, model_name = self.parse_model_id(model_id)
        from src.infra.config import get_settings

        keep_alive = get_settings().OLLAMA_KEEP_ALIVE
        return ChatOllama(
            model=model_name,
            base_url=self.base_url,
            temperature=temperature,
            keep_alive=keep_alive,
            **kwargs,
        )

    async def list_models(self) -> list[ModelInfo]:
        try:
            client = self._get_client()
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
            models = []
            for model in data.get("models", []):
                details = model.get("details", {})
                models.append(
                    ModelInfo(
                        id=f"ollama:{model['name']}",
                        name=model["name"].split(":")[0],
                        provider="ollama",
                        size=details.get("parameter_size"),
                        family=details.get("family"),
                        quantization=details.get("quantization_level"),
                    )
                )
            return models
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as e:
            logger.error(f"Failed to list Ollama models: {e}")
            return []

    async def is_available(self) -> bool:
        try:
            client = self._get_client()
            response = await client.get("/api/tags", timeout=5.0)
            return response.status_code == 200
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError):
            return False

    async def list_running_models(self) -> list[dict]:
        try:
            client = self._get_client()
            response = await client.get("/api/ps", timeout=5.0)
            if response.status_code != 200:
                return []
            data = response.json()
            models = []
            for m in data.get("models", []):
                details = m.get("details", {})
                models.append(
                    {
                        "name": m.get("name", ""),
                        "size_vram": m.get("size_vram", 0),
                        "expires_at": m.get("expires_at"),
                        "context_length": m.get("context_length", 0),
                        "details": {
                            "parameter_size": details.get("parameter_size", ""),
                            "quantization_level": details.get(
                                "quantization_level", ""
                            ),
                            "family": details.get("family", ""),
                        },
                    }
                )
            return models
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as e:
            logger.debug(f"Failed to list running models: {e}")
            return []

    async def pull_model(self, model_name: str) -> bool:
        try:
            client = self._get_client()
            response = await client.post(
                "/api/pull",
                json={"name": model_name},
                timeout=600.0,
            )
            return response.status_code == 200
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as e:
            logger.error(f"Failed to pull model {model_name}: {e}")
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
