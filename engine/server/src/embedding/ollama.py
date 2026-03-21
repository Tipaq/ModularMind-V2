"""
Ollama Embedding Provider.

Generates embeddings using locally running Ollama.
"""

import asyncio
import logging

import httpx

from .base import EmbeddingProvider

logger = logging.getLogger(__name__)

MODEL_DIMENSIONS = {
    "nomic-embed-text": 768,
    "mxbai-embed-large": 1024,
    "all-minilm": 384,
    "snowflake-arctic-embed": 1024,
}

_EMBED_CONCURRENCY = 10


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Ollama embedding provider for local text embeddings."""

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "nomic-embed-text",
        timeout: float = 30.0,
    ):
        self.base_url = base_url
        self.model = model
        self.timeout = timeout
        self._dimension = MODEL_DIMENSIONS.get(model, 768)
        self._client: httpx.AsyncClient | None = None

    def _get_client(self, timeout: float | None = None) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
            )
        return self._client

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def provider_name(self) -> str:
        return "ollama"

    async def embed_text(self, text: str) -> list[float]:
        try:
            client = self._get_client()
            response = await client.post(
                "/api/embed",
                json={"model": self.model, "input": text},
            )
            if response.status_code == 404:
                response = await client.post(
                    "/api/embeddings",
                    json={"model": self.model, "prompt": text},
                )
                response.raise_for_status()
                return response.json()["embedding"]
            response.raise_for_status()
            return response.json()["embeddings"][0]
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama embedding HTTP error: {e}")
            raise RuntimeError(f"Failed to generate embedding: {e}") from e
        except (httpx.RequestError, ConnectionError, TimeoutError, KeyError) as e:
            logger.error(f"Ollama embedding error: {e}")
            raise RuntimeError(f"Failed to generate embedding: {e}") from e

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        semaphore = asyncio.Semaphore(_EMBED_CONCURRENCY)

        async def _bounded_embed(text: str) -> list[float]:
            async with semaphore:
                return await self.embed_text(text)

        return list(await asyncio.gather(*[_bounded_embed(t) for t in texts]))

    async def is_available(self) -> bool:
        try:
            client = self._get_client()
            response = await client.get("/api/tags", timeout=5.0)
            if response.status_code != 200:
                return False
            data = response.json()
            models = [m["name"] for m in data.get("models", [])]
            return self.model in models or f"{self.model}:latest" in models
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError):
            return False

    async def ensure_model(self) -> bool:
        if await self.is_available():
            return True
        try:
            logger.info(f"Pulling embedding model: {self.model}")
            client = self._get_client()
            response = await client.post(
                "/api/pull",
                json={"name": self.model},
                timeout=600.0,
            )
            return response.status_code == 200
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as e:
            logger.error(f"Failed to pull embedding model: {e}")
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
