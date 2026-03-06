"""
OpenAI Embedding Provider.

Generates embeddings using the OpenAI API (text-embedding-3-small/large, ada-002).
"""

import logging

import httpx

from .base import EmbeddingProvider

logger = logging.getLogger(__name__)

MODEL_DIMENSIONS = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
}


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI embedding provider using the Embeddings API."""

    def __init__(
        self,
        api_key: str = "",
        model: str = "text-embedding-3-small",
        timeout: float = 30.0,
        **_kwargs,
    ):
        self._api_key = api_key
        self.model = model
        self.timeout = timeout
        self._dimension = MODEL_DIMENSIONS.get(model, 1536)

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def provider_name(self) -> str:
        return "openai"

    async def embed_text(self, text: str) -> list[float]:
        result = await self.embed_texts([text])
        return result[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not self._api_key:
            raise RuntimeError("OpenAI API key not configured")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"model": self.model, "input": texts},
                )
                response.raise_for_status()
                data = response.json()
                # Sort by index to preserve order
                sorted_data = sorted(data["data"], key=lambda x: x["index"])
                return [item["embedding"] for item in sorted_data]
        except httpx.HTTPStatusError as e:
            logger.error("OpenAI embedding HTTP error: %s", e)
            raise RuntimeError(f"OpenAI embedding failed: {e}") from e
        except (httpx.RequestError, ConnectionError, TimeoutError, KeyError) as e:
            logger.error("OpenAI embedding error: %s", e)
            raise RuntimeError(f"OpenAI embedding failed: {e}") from e

    async def is_available(self) -> bool:
        if not self._api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"model": self.model, "input": "test"},
                )
                return response.status_code == 200
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError):
            return False
