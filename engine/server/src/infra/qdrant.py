"""
Qdrant client factory — singleton async client with collection bootstrapping.

Includes Prometheus instrumentation for search/upsert latency,
error counts, and collection point counts.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from prometheus_client import Counter, Gauge, Histogram
from qdrant_client import AsyncQdrantClient, models

if TYPE_CHECKING:
    from src.infra.config import Settings

logger = logging.getLogger(__name__)

# ─── Prometheus Metrics ───────────────────────────────────────────────────────

qdrant_search_duration = Histogram(
    "modularmind_qdrant_search_duration_seconds",
    "Qdrant search latency",
    ["collection", "search_type"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)

qdrant_upsert_duration = Histogram(
    "modularmind_qdrant_upsert_duration_seconds",
    "Qdrant upsert latency",
    ["collection"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)

qdrant_errors_total = Counter(
    "modularmind_qdrant_errors_total",
    "Qdrant errors by type",
    ["error_type"],
)

qdrant_points_total = Gauge(
    "modularmind_qdrant_points_total",
    "Number of points per collection",
    ["collection"],
)

_DENSE_DIM_DEFAULT = 768
_DENSE_DISTANCE = models.Distance.COSINE

SYSTEM_INDEXES_COLLECTION = "system-indexes"

_SYSTEM_INDEX_INDEXES: list[tuple[str, models.PayloadSchemaType]] = [
    ("metadata.system_id", models.PayloadSchemaType.KEYWORD),
    ("metadata.kind", models.PayloadSchemaType.KEYWORD),
    ("metadata.unit_id", models.PayloadSchemaType.KEYWORD),
    ("metadata.body_hash", models.PayloadSchemaType.KEYWORD),
    ("metadata.depth", models.PayloadSchemaType.INTEGER),
]


def _dense_dim_for_collection(name: str, settings: Settings) -> int:
    """Resolve the dense vector dimension based on the configured embedding model."""
    from src.embedding.ollama import MODEL_DIMENSIONS

    if name == settings.QDRANT_COLLECTION_KNOWLEDGE:
        model = settings.KNOWLEDGE_EMBEDDING_MODEL or settings.EMBEDDING_MODEL
    else:
        model = settings.EMBEDDING_MODEL

    return MODEL_DIMENSIONS.get(model, _DENSE_DIM_DEFAULT)


# Payload indexes to create on every collection
_PAYLOAD_INDEXES: list[tuple[str, models.PayloadSchemaType]] = [
    ("scope", models.PayloadSchemaType.KEYWORD),
    ("group_slugs", models.PayloadSchemaType.KEYWORD),
    ("agent_id", models.PayloadSchemaType.KEYWORD),
    ("user_id", models.PayloadSchemaType.KEYWORD),
    ("conversation_id", models.PayloadSchemaType.KEYWORD),
    ("document_id", models.PayloadSchemaType.KEYWORD),
    ("collection_id", models.PayloadSchemaType.KEYWORD),
]


class QdrantClientFactory:
    """Lazy-initialised singleton around ``AsyncQdrantClient``."""

    def __init__(self) -> None:
        self._client: AsyncQdrantClient | None = None
        self._lock = asyncio.Lock()
        self._collections_ensured = False

    async def get_client(self) -> AsyncQdrantClient:
        """Return the singleton client, bootstrapping collections on first call."""
        if self._client is None:
            async with self._lock:
                if self._client is None:
                    from src.infra.config import get_settings

                    settings = get_settings()
                    self._client = AsyncQdrantClient(
                        url=settings.QDRANT_URL,
                        api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None,
                        timeout=30,
                        check_compatibility=False,
                    )
        if not self._collections_ensured:
            await self.ensure_collections()
        return self._client

    async def ensure_collections(self) -> None:
        """Create knowledge + system-indexes collections if missing (idempotent)."""
        if self._client is None:
            await self.get_client()
            return  # get_client already called ensure_collections

        from src.infra.config import get_settings

        settings = get_settings()
        await self._ensure_one(settings.QDRANT_COLLECTION_KNOWLEDGE, settings)
        await self._ensure_one(
            SYSTEM_INDEXES_COLLECTION, settings, extra_indexes=_SYSTEM_INDEX_INDEXES
        )
        self._collections_ensured = True
        logger.info(
            "Qdrant collections ensured: %s, %s",
            settings.QDRANT_COLLECTION_KNOWLEDGE,
            SYSTEM_INDEXES_COLLECTION,
        )

    async def _ensure_one(
        self,
        name: str,
        settings: Settings,
        extra_indexes: list[tuple[str, models.PayloadSchemaType]] | None = None,
    ) -> None:
        assert self._client is not None
        expected_dim = _dense_dim_for_collection(name, settings)
        exists = await self._client.collection_exists(name)
        if exists:
            info = await self._client.get_collection(name)
            actual = info.config.params.on_disk_payload
            expected = settings.QDRANT_ON_DISK_PAYLOAD
            if actual != expected:
                logger.warning(
                    "Collection %s has on_disk_payload=%s, but config specifies %s. "
                    "Recreation required to change this setting.",
                    name,
                    actual,
                    expected,
                )
            # Check vector dimension mismatch
            dense_params = info.config.params.vectors.get("dense")
            if dense_params and dense_params.size != expected_dim:
                logger.warning(
                    "Collection %s has dense vector size=%d, but configured model "
                    "needs size=%d. Recreation required to change dimensions.",
                    name,
                    dense_params.size,
                    expected_dim,
                )
            return

        await self._client.create_collection(
            collection_name=name,
            vectors_config={
                "dense": models.VectorParams(
                    size=expected_dim,
                    distance=_DENSE_DISTANCE,
                    on_disk=True,
                ),
            },
            sparse_vectors_config={
                "sparse": models.SparseVectorParams(
                    modifier=models.Modifier.IDF,
                ),
            },
            on_disk_payload=settings.QDRANT_ON_DISK_PAYLOAD,
        )
        logger.info("Created Qdrant collection: %s", name)

        all_indexes = _PAYLOAD_INDEXES + (extra_indexes or [])
        for field_name, schema_type in all_indexes:
            await self._client.create_payload_index(
                collection_name=name,
                field_name=field_name,
                field_schema=schema_type,
            )

    async def refresh_metrics(self) -> None:
        """Update Prometheus gauges with current Qdrant collection stats."""
        if self._client is None:
            return

        from src.infra.config import get_settings

        settings = get_settings()
        name = settings.QDRANT_COLLECTION_KNOWLEDGE
        try:
            info = await self._client.get_collection(name)
            qdrant_points_total.labels(collection=name).set(info.points_count or 0)
        except (ConnectionError, OSError, TimeoutError) as e:
            logger.debug("Failed to refresh Qdrant metrics for %s: %s", name, e)

    async def create_snapshot(self, collection_name: str) -> str:
        """Create a snapshot of a collection. Returns snapshot description."""
        client = await self.get_client()
        result = await client.create_snapshot(collection_name=collection_name)
        logger.info("Snapshot created for %s: %s", collection_name, result.name)
        return result.name

    async def close(self) -> None:
        """Graceful shutdown."""
        if self._client is not None:
            await self._client.close()
            self._client = None
            self._collections_ensured = False
            logger.info("Qdrant client closed")


qdrant_factory = QdrantClientFactory()
