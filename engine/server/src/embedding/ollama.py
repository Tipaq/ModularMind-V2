"""
Ollama Embedding Provider.

Generates embeddings using locally running Ollama.
"""

import logging

import httpx

from .base import EmbeddingProvider

logger = logging.getLogger(__name__)

# Model dimensions for common Ollama embedding models
MODEL_DIMENSIONS = {
    "nomic-embed-text": 768,
    "mxbai-embed-large": 1024,
    "all-minilm": 384,
    "snowflake-arctic-embed": 1024,
}


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Ollama embedding provider for local text embeddings.

    Uses Ollama running locally for generating embeddings with
    models like nomic-embed-text.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "nomic-embed-text",
        timeout: float = 30.0,
    ):
        """Initialize Ollama embedding provider.

        Args:
            base_url: Ollama server URL
            model: Embedding model name
            timeout: Request timeout in seconds
        """
        self.base_url = base_url
        self.model = model
        self.timeout = timeout
        self._dimension = MODEL_DIMENSIONS.get(model, 768)

    @property
    def dimension(self) -> int:
        """Get the embedding dimension."""
        return self._dimension

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "ollama"

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector

        Raises:
            RuntimeError: If embedding fails
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Ollama ≥0.5.0 uses /api/embed; older uses /api/embeddings
                response = await client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.model, "input": text},
                )
                if response.status_code == 404:
                    # Fallback for older Ollama versions
                    response = await client.post(
                        f"{self.base_url}/api/embeddings",
                        json={"model": self.model, "prompt": text},
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data["embedding"]
                response.raise_for_status()
                data = response.json()
                # /api/embed returns {"embeddings": [[...]]}
                return data["embeddings"][0]

        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama embedding HTTP error: {e}")
            raise RuntimeError(f"Failed to generate embedding: {e}") from e
        except (httpx.RequestError, ConnectionError, TimeoutError, KeyError) as e:
            logger.error(f"Ollama embedding error: {e}")
            raise RuntimeError(f"Failed to generate embedding: {e}") from e

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        Note: Ollama doesn't have a native batch endpoint, so this
        makes sequential requests. For better performance with many
        texts, consider using a provider with batch support.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        embeddings = []
        for text in texts:
            embedding = await self.embed_text(text)
            embeddings.append(embedding)
        return embeddings

    async def is_available(self) -> bool:
        """Check if Ollama is running and the model is available.

        Returns:
            True if Ollama is responding and model is loaded
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Check if Ollama is running
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code != 200:
                    return False

                # Check if embedding model is available
                data = response.json()
                models = [m["name"] for m in data.get("models", [])]

                # Check for exact match or with :latest suffix
                return self.model in models or f"{self.model}:latest" in models

        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError):
            return False

    async def ensure_model(self) -> bool:
        """Ensure the embedding model is pulled.

        Returns:
            True if model is available or was successfully pulled
        """
        if await self.is_available():
            return True

        try:
            logger.info(f"Pulling embedding model: {self.model}")
            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/pull",
                    json={"name": self.model},
                )
                return response.status_code == 200
        except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as e:
            logger.error(f"Failed to pull embedding model: {e}")
            return False
