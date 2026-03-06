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
    """Ollama provider for local LLM inference.

    Uses Ollama running locally or on a remote server for
    running open-source LLMs like Llama, Mistral, etc.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        timeout: float = 120.0,
    ):
        """Initialize Ollama provider.

        Args:
            base_url: Ollama server URL
            timeout: Request timeout in seconds
        """
        self.base_url = base_url
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "ollama"

    async def get_model(
        self,
        model_id: str,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> BaseChatModel:
        """Get an Ollama chat model.

        Args:
            model_id: Model name (e.g., "llama3.2:latest")
            temperature: Sampling temperature
            **kwargs: Additional model parameters

        Returns:
            ChatOllama instance
        """
        # Strip provider prefix if present
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
        """List available Ollama models.

        Returns:
            List of locally available models
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/api/tags")
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
        """Check if Ollama is running and accessible.

        Returns:
            True if Ollama server is responding
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError):
            return False

    async def list_running_models(self) -> list[dict]:
        """List models currently loaded in VRAM via Ollama /api/ps.

        Returns:
            List of dicts with name, size_vram, expires_at, context_length, details
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/ps")
                if response.status_code != 200:
                    return []
                data = response.json()
                models = []
                for m in data.get("models", []):
                    details = m.get("details", {})
                    models.append({
                        "name": m.get("name", ""),
                        "size_vram": m.get("size_vram", 0),
                        "expires_at": m.get("expires_at"),
                        "context_length": m.get("context_length", 0),
                        "details": {
                            "parameter_size": details.get("parameter_size", ""),
                            "quantization_level": details.get("quantization_level", ""),
                            "family": details.get("family", ""),
                        },
                    })
                return models
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as e:
            logger.debug(f"Failed to list running models: {e}")
            return []

    async def pull_model(self, model_name: str) -> bool:
        """Pull a model from Ollama library.

        Args:
            model_name: Name of the model to pull

        Returns:
            True if pull was successful
        """
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/pull",
                    json={"name": model_name},
                )
                return response.status_code == 200
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as e:
            logger.error(f"Failed to pull model {model_name}: {e}")
            return False
