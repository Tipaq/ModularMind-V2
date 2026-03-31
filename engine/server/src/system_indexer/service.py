"""System Indexer service — orchestrates indexing, search, and lifecycle."""

from __future__ import annotations

import logging
from uuid import uuid4

from qdrant_client import models
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.qdrant import SYSTEM_INDEXES_COLLECTION, qdrant_factory
from src.infra.vector_store import tokenize_bm25
from src.system_indexer.db_models import IndexedSystem, SystemRelationship
from src.system_indexer.graph_query import StructuralGraphQuery
from src.system_indexer.indexer import delete_system_data
from src.system_indexer.schemas import SearchResult, StructureItem

logger = logging.getLogger(__name__)


async def create_system(
    session: AsyncSession,
    name: str,
    system_type: str,
    base_url: str | None = None,
) -> IndexedSystem:
    """Register a new system (status=pending). Caller triggers indexing."""
    system = IndexedSystem(
        id=str(uuid4()),
        name=name,
        system_type=system_type,
        base_url=base_url,
    )
    session.add(system)
    await session.flush()
    return system


async def get_system(session: AsyncSession, system_id: str) -> IndexedSystem | None:
    result = await session.execute(
        select(IndexedSystem).where(IndexedSystem.id == system_id)
    )
    return result.scalar_one_or_none()


async def list_systems(session: AsyncSession) -> list[IndexedSystem]:
    result = await session.execute(
        select(IndexedSystem).order_by(IndexedSystem.created_at.desc())
    )
    return list(result.scalars().all())


async def delete_system(session: AsyncSession, system_id: str) -> bool:
    """Cascade delete: Qdrant points → PG relations → PG system."""
    system = await get_system(session, system_id)
    if not system:
        return False

    try:
        await delete_system_data(system_id, session)
    except Exception:
        logger.exception("Failed to delete Qdrant data for system %s", system_id)

    try:
        await session.execute(
            delete(SystemRelationship).where(
                SystemRelationship.system_id == system_id
            )
        )
    except Exception:
        logger.exception("Failed to delete PG relations for system %s", system_id)

    await session.delete(system)
    return True


async def search_system(
    session: AsyncSession,
    system_id: str,
    query: str,
    embed_fn,
    kind_filter: str | None = None,
    max_hops: int = 0,
    limit: int = 10,
) -> list[SearchResult]:
    """Hybrid search in a system's structural data, optionally with graph expansion."""
    embeddings = await embed_fn([query])
    query_embedding = embeddings[0]

    must_filters = [
        models.FieldCondition(
            key="metadata.system_id",
            match=models.MatchValue(value=system_id),
        )
    ]
    if kind_filter:
        must_filters.append(
            models.FieldCondition(
                key="metadata.kind",
                match=models.MatchValue(value=kind_filter),
            )
        )

    client = await qdrant_factory.get_client()
    sparse = tokenize_bm25(query)

    hits = await client.query_points(
        collection_name=SYSTEM_INDEXES_COLLECTION,
        prefetch=[
            models.Prefetch(query=query_embedding, using="dense", limit=50),
            models.Prefetch(query=sparse, using="sparse", limit=50),
        ],
        query=models.FusionQuery(fusion=models.Fusion.RRF),
        query_filter=models.Filter(must=must_filters),
        limit=limit,
        with_payload=True,
    )

    results: list[SearchResult] = []
    for point in hits.points:
        meta = point.payload.get("metadata", {})
        results.append(
            SearchResult(
                unit_id=meta.get("unit_id", str(point.id)),
                content=point.payload.get("content", ""),
                score=point.score,
                kind=meta.get("kind", ""),
                depth=meta.get("depth", 0),
            )
        )

    if max_hops > 0 and results:
        gq = StructuralGraphQuery(session)
        expanded_ids: set[str] = set()
        for res in results:
            neighbors = await gq.get_neighbors(
                res.unit_id, system_id, hops=max_hops, limit=20
            )
            expanded_ids.update(neighbors)
        already = {r.unit_id for r in results}
        new_ids = list(expanded_ids - already)
        if new_ids:
            from src.system_indexer.graph_query import _hydrate_units

            hydrated = await _hydrate_units(new_ids)
            for unit in hydrated:
                results.append(
                    SearchResult(
                        unit_id=unit["unit_id"],
                        content=unit["content"],
                        score=0.0,
                        kind=unit["kind"],
                        depth=unit["depth"],
                    )
                )

    return results


async def browse_structure(
    system_id: str,
    kind: str | None = None,
    depth: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[StructureItem], int]:
    """Paginated browse of structural units in Qdrant."""
    client = await qdrant_factory.get_client()

    must_filters = [
        models.FieldCondition(
            key="metadata.system_id",
            match=models.MatchValue(value=system_id),
        )
    ]
    if kind:
        must_filters.append(
            models.FieldCondition(
                key="metadata.kind",
                match=models.MatchValue(value=kind),
            )
        )
    if depth is not None:
        must_filters.append(
            models.FieldCondition(
                key="metadata.depth",
                match=models.MatchValue(value=depth),
            )
        )

    scroll_filter = models.Filter(must=must_filters)

    count_result = await client.count(
        collection_name=SYSTEM_INDEXES_COLLECTION,
        count_filter=scroll_filter,
        exact=True,
    )
    total = count_result.count

    points, _ = await client.scroll(
        collection_name=SYSTEM_INDEXES_COLLECTION,
        scroll_filter=scroll_filter,
        limit=limit,
        offset=offset if offset > 0 else None,
        with_payload=True,
    )

    items: list[StructureItem] = []
    for point in points:
        meta = point.payload.get("metadata", {})
        items.append(
            StructureItem(
                unit_id=meta.get("unit_id", str(point.id)),
                content=point.payload.get("content", ""),
                kind=meta.get("kind", ""),
                depth=meta.get("depth", 0),
                parent_id=meta.get("parent_id"),
                body_hash=meta.get("body_hash"),
            )
        )

    return items, total
