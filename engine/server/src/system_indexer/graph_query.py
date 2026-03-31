"""2-hop graph traversal over system relationships (PG) + Qdrant hydration."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.qdrant import SYSTEM_INDEXES_COLLECTION, qdrant_factory
from src.system_indexer.db_models import SystemRelationship

logger = logging.getLogger(__name__)


class StructuralGraphQuery:
    """Query the relationship graph stored in PG, hydrate from Qdrant."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_neighbors(
        self,
        unit_id: str,
        system_id: str,
        hops: int = 1,
        limit: int = 100,
        offset: int = 0,
    ) -> list[str]:
        """Return neighbor unit_ids reachable in `hops` steps."""
        current_ids = {unit_id}
        visited = {unit_id}

        for _ in range(hops):
            if not current_ids:
                break
            stmt = (
                select(SystemRelationship.target_unit_id)
                .where(
                    SystemRelationship.system_id == system_id,
                    SystemRelationship.source_unit_id.in_(current_ids),
                )
            )
            result = await self._session.execute(stmt)
            new_ids = {row[0] for row in result.all()} - visited
            visited.update(new_ids)
            current_ids = new_ids

        visited.discard(unit_id)
        sorted_ids = sorted(visited)
        return sorted_ids[offset : offset + limit]

    async def traverse(
        self,
        start_id: str,
        system_id: str,
        max_hops: int = 2,
    ) -> list[dict]:
        """Traverse graph from start_id, hydrate all reached units from Qdrant."""
        neighbor_ids = await self.get_neighbors(
            start_id, system_id, hops=max_hops, limit=500
        )
        all_ids = [start_id, *neighbor_ids]
        return await _hydrate_units(all_ids)

    async def get_related_by_kind(
        self,
        unit_id: str,
        system_id: str,
        rel_kind: str,
        limit: int = 50,
    ) -> list[dict]:
        """Get neighbors connected by a specific relationship kind."""
        stmt = (
            select(SystemRelationship.target_unit_id)
            .where(
                SystemRelationship.system_id == system_id,
                SystemRelationship.source_unit_id == unit_id,
                SystemRelationship.kind == rel_kind,
            )
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        target_ids = [row[0] for row in result.all()]
        if not target_ids:
            return []
        return await _hydrate_units(target_ids)


async def _hydrate_units(unit_ids: list[str]) -> list[dict]:
    """Fetch unit payloads from Qdrant by point IDs."""
    if not unit_ids:
        return []

    client = await qdrant_factory.get_client()
    points = await client.retrieve(
        collection_name=SYSTEM_INDEXES_COLLECTION,
        ids=unit_ids,
        with_payload=True,
    )
    results: list[dict] = []
    for point in points:
        meta = point.payload.get("metadata", {})
        results.append(
            {
                "unit_id": meta.get("unit_id", str(point.id)),
                "content": point.payload.get("content", ""),
                "kind": meta.get("kind", ""),
                "depth": meta.get("depth", 0),
                "system_id": meta.get("system_id", ""),
                "parent_id": meta.get("parent_id"),
                "body_hash": meta.get("body_hash"),
            }
        )
    return results
