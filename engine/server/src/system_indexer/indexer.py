"""Direct Qdrant + PG write pipeline for structural indexing.

Bypasses the RAG upload pipeline — writes directly from StructuralUnits.
Handles batch embedding, batch upsert, and relationship storage.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from qdrant_client import models
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.qdrant import SYSTEM_INDEXES_COLLECTION, qdrant_factory
from src.infra.vector_store import tokenize_bm25
from src.system_indexer.chunker import split_units
from src.system_indexer.db_models import IndexedSystem, SystemRelationship
from src.system_indexer.models import Relationship, StructuralUnit, SystemIndex

logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = 100
QDRANT_BATCH_SIZE = 200
PG_BATCH_SIZE = 500


async def index_system(
    system_id: str,
    system_index: SystemIndex,
    session: AsyncSession,
    embed_fn: Callable[[list[str]], Any],
    progress_fn: Callable[[str, int, int], None] | None = None,
) -> None:
    """Index a full SystemIndex into Qdrant + PG.

    Args:
        system_id: IndexedSystem.id
        system_index: Units + relationships produced by a connector.
        session: Async DB session (caller manages transaction).
        embed_fn: async fn(texts) -> list[list[float]].
        progress_fn: optional callback(stage, current, total).
    """
    units = system_index.units
    relationships = system_index.relationships
    total_units = len(units)

    await _set_status(session, system_id, "indexing")

    chunks = split_units(units)
    await _upsert_chunks_to_qdrant(chunks, embed_fn, progress_fn, total_units)
    await _insert_relationships(session, system_id, relationships)
    await _update_system_stats(session, system_id, total_units, len(relationships))


async def delete_system_data(system_id: str, session: AsyncSession) -> None:
    """Remove all Qdrant points + PG relationships for a system."""
    client = await qdrant_factory.get_client()
    await client.delete(
        collection_name=SYSTEM_INDEXES_COLLECTION,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="metadata.system_id",
                        match=models.MatchValue(value=system_id),
                    )
                ]
            )
        ),
    )
    await session.execute(
        delete(SystemRelationship).where(SystemRelationship.system_id == system_id)
    )


async def fetch_existing_hashes(system_id: str) -> dict[str, str]:
    """Scroll all points for a system and return {unit_id: body_hash}."""
    client = await qdrant_factory.get_client()
    hashes: dict[str, str] = {}
    offset = None

    while True:
        result = await client.scroll(
            collection_name=SYSTEM_INDEXES_COLLECTION,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="metadata.system_id",
                        match=models.MatchValue(value=system_id),
                    )
                ]
            ),
            limit=1000,
            offset=offset,
            with_payload=["metadata.unit_id", "metadata.body_hash"],
        )
        points, next_offset = result
        for point in points:
            meta = point.payload.get("metadata", {})
            uid = meta.get("unit_id", "")
            bh = meta.get("body_hash", "")
            if uid:
                hashes[uid] = bh or ""
        if next_offset is None:
            break
        offset = next_offset

    return hashes


async def incremental_reindex(
    system_id: str,
    new_index: SystemIndex,
    session: AsyncSession,
    embed_fn: Callable[[list[str]], Any],
    progress_fn: Callable[[str, int, int], None] | None = None,
) -> None:
    """Re-index only changed units. Delete removed, upsert modified + new."""
    existing_hashes = await fetch_existing_hashes(system_id)
    new_units_map = {u.id: u for u in new_index.units}

    deleted_ids = [uid for uid in existing_hashes if uid not in new_units_map]
    changed_units: list[StructuralUnit] = []
    for unit in new_index.units:
        old_hash = existing_hashes.get(unit.id)
        if old_hash is None or old_hash != (unit.body_hash or ""):
            changed_units.append(unit)

    if deleted_ids:
        await _delete_points_by_unit_ids(deleted_ids)

    if changed_units:
        chunks = split_units(changed_units)
        await _upsert_chunks_to_qdrant(
            chunks, embed_fn, progress_fn, len(changed_units)
        )

    await session.execute(
        delete(SystemRelationship).where(SystemRelationship.system_id == system_id)
    )
    await _insert_relationships(session, system_id, new_index.relationships)
    await _update_system_stats(
        session, system_id, len(new_units_map), len(new_index.relationships)
    )

    logger.info(
        "Incremental reindex system=%s: %d deleted, %d upserted, %d unchanged",
        system_id,
        len(deleted_ids),
        len(changed_units),
        len(new_units_map) - len(changed_units),
    )


# ── Internal helpers ─────────────────────────────────────────────────────────


async def _upsert_chunks_to_qdrant(
    chunks: list,
    embed_fn: Callable[[list[str]], Any],
    progress_fn: Callable[[str, int, int], None] | None,
    total: int,
) -> None:
    """Embed in batches, then upsert to Qdrant in batches."""
    client = await qdrant_factory.get_client()
    all_points: list[models.PointStruct] = []

    for batch_start in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[batch_start : batch_start + EMBED_BATCH_SIZE]
        texts = [c.content for c in batch]
        embeddings = await embed_fn(texts)

        for chunk, embedding in zip(batch, embeddings, strict=True):
            sparse = tokenize_bm25(chunk.content)
            all_points.append(
                models.PointStruct(
                    id=chunk.metadata["unit_id"],
                    vector={"dense": embedding, "sparse": sparse},
                    payload={
                        "content": chunk.content,
                        "metadata": chunk.metadata,
                    },
                )
            )
        if progress_fn:
            progress_fn("embedding", min(batch_start + len(batch), total), total)

    for batch_start in range(0, len(all_points), QDRANT_BATCH_SIZE):
        batch = all_points[batch_start : batch_start + QDRANT_BATCH_SIZE]
        t0 = time.monotonic()
        await client.upsert(
            collection_name=SYSTEM_INDEXES_COLLECTION,
            points=batch,
        )
        elapsed = time.monotonic() - t0
        logger.debug("Qdrant upsert batch %d points in %.2fs", len(batch), elapsed)
        if progress_fn:
            done = min(batch_start + len(batch), len(all_points))
            progress_fn("qdrant_upsert", done, len(all_points))


async def _insert_relationships(
    session: AsyncSession,
    system_id: str,
    relationships: list[Relationship],
) -> None:
    """Bulk insert relationships into PG in batches."""
    if not relationships:
        return

    for batch_start in range(0, len(relationships), PG_BATCH_SIZE):
        batch = relationships[batch_start : batch_start + PG_BATCH_SIZE]
        rows = [
            {
                "id": str(uuid4()),
                "system_id": system_id,
                "source_unit_id": rel.source_id,
                "target_unit_id": rel.target_id,
                "kind": rel.kind,
                "weight": rel.weight,
                "metadata": rel.metadata,
            }
            for rel in batch
        ]
        await session.execute(insert(SystemRelationship), rows)


async def _delete_points_by_unit_ids(unit_ids: list[str]) -> None:
    """Delete Qdrant points by their unit_id (= point ID)."""
    client = await qdrant_factory.get_client()
    await client.delete(
        collection_name=SYSTEM_INDEXES_COLLECTION,
        points_selector=models.PointIdsList(points=unit_ids),
    )


async def _set_status(session: AsyncSession, system_id: str, status: str) -> None:
    result = await session.execute(
        select(IndexedSystem).where(IndexedSystem.id == system_id)
    )
    system = result.scalar_one_or_none()
    if system:
        system.status = status


async def _update_system_stats(
    session: AsyncSession,
    system_id: str,
    unit_count: int,
    relationship_count: int,
) -> None:
    from src.infra.utils import utcnow

    result = await session.execute(
        select(IndexedSystem).where(IndexedSystem.id == system_id)
    )
    system = result.scalar_one_or_none()
    if system:
        system.unit_count = unit_count
        system.relationship_count = relationship_count
        system.status = "ready"
        system.last_indexed_at = utcnow()
