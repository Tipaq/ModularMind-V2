"""
Memory Graph Builder.

Builds edges between memory entries based on:
1. Entity overlap (inverted index approach — O(n * avg_entities))
2. Same category correlation
3. Semantic similarity fallback (Qdrant NN for isolated nodes)
"""

import logging
from collections import defaultdict
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import EdgeType, MemoryEdge, MemoryEntry
from .vector_store import QdrantMemoryVectorStore

logger = logging.getLogger(__name__)

_MAX_NODES_PER_SCOPE = 500
_SEMANTIC_FALLBACK_THRESHOLD = 0.85
_SEMANTIC_FALLBACK_LIMIT = 3


class MemoryGraphBuilder:
    """Builds and manages graph edges between memory entries."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._vector_store = QdrantMemoryVectorStore()

    async def build_edges(
        self,
        scope: str | None = None,
        scope_id: str | None = None,
    ) -> int:
        """Build edges for memories in the given scope (or all scopes).

        Uses an inverted entity index for O(n * avg_entities) complexity.
        Returns the number of edges created.
        """
        # Load active entries (highest importance first, capped)
        query = select(MemoryEntry).where(MemoryEntry.expired_at.is_(None))
        if scope:
            query = query.where(MemoryEntry.scope == scope)
        if scope_id:
            query = query.where(MemoryEntry.scope_id == scope_id)
        query = query.order_by(MemoryEntry.importance.desc()).limit(
            _MAX_NODES_PER_SCOPE
        )

        result = await self.db.execute(query)
        entries = list(result.scalars().all())

        if len(entries) < 2:
            return 0

        entries_by_id = {e.id: e for e in entries}
        edge_set: dict[tuple[str, str], dict] = {}

        # Step 1: Entity overlap via inverted index
        entity_index: dict[str, set[str]] = defaultdict(set)
        for entry in entries:
            entities = (entry.meta or {}).get("entities", [])
            for entity in entities:
                entity_key = str(entity).lower().strip()
                if entity_key:
                    entity_index[entity_key].add(entry.id)

        for entity, entry_ids in entity_index.items():
            if len(entry_ids) < 2:
                continue
            id_list = sorted(entry_ids)
            for i in range(len(id_list)):
                for j in range(i + 1, len(id_list)):
                    pair = (id_list[i], id_list[j])
                    if pair not in edge_set:
                        # Compute shared entities between this pair
                        e_a = entries_by_id[pair[0]]
                        e_b = entries_by_id[pair[1]]
                        ents_a = set(
                            str(x).lower().strip()
                            for x in (e_a.meta or {}).get("entities", [])
                        )
                        ents_b = set(
                            str(x).lower().strip()
                            for x in (e_b.meta or {}).get("entities", [])
                        )
                        shared = ents_a & ents_b
                        weight = len(shared) / max(len(ents_a), len(ents_b), 1)
                        edge_set[pair] = {
                            "edge_type": EdgeType.ENTITY_OVERLAP,
                            "weight": weight,
                            "shared_entities": sorted(shared),
                        }

        # Step 2: Same category (only for entries not already connected)
        cat_index: dict[str, set[str]] = defaultdict(set)
        for entry in entries:
            cat = (entry.meta or {}).get("category", "")
            if cat:
                cat_index[cat].add(entry.id)

        for cat, entry_ids in cat_index.items():
            if len(entry_ids) < 2:
                continue
            id_list = sorted(entry_ids)
            for i in range(len(id_list)):
                for j in range(i + 1, len(id_list)):
                    pair = (id_list[i], id_list[j])
                    # Only add if same scope AND no existing entity edge
                    e_a = entries_by_id[pair[0]]
                    e_b = entries_by_id[pair[1]]
                    if pair not in edge_set and e_a.scope == e_b.scope:
                        edge_set[pair] = {
                            "edge_type": EdgeType.SAME_CATEGORY,
                            "weight": 0.5,
                            "shared_entities": [],
                        }

        # Step 3: Semantic fallback for isolated nodes
        connected_ids = set()
        for src, tgt in edge_set:
            connected_ids.add(src)
            connected_ids.add(tgt)

        isolated_ids = [e.id for e in entries if e.id not in connected_ids]
        # Semantic fallback queries are limited to avoid Qdrant overload
        for entry_id in isolated_ids[:50]:
            entry = entries_by_id[entry_id]
            try:
                neighbors = await self._vector_store.search(
                    query_embedding=[],  # Will be fetched from Qdrant point
                    query_text=entry.content,
                    user_id=entry.user_id or "",
                    limit=_SEMANTIC_FALLBACK_LIMIT,
                    threshold=_SEMANTIC_FALLBACK_THRESHOLD,
                )
                for neighbor in neighbors:
                    if neighbor.point_id == entry_id:
                        continue
                    if neighbor.point_id not in entries_by_id:
                        continue
                    pair = tuple(sorted([entry_id, neighbor.point_id]))
                    if pair not in edge_set:
                        edge_set[pair] = {
                            "edge_type": EdgeType.SEMANTIC_SIMILARITY,
                            "weight": neighbor.score,
                            "shared_entities": [],
                        }
            except Exception:
                logger.debug(
                    "Semantic fallback failed for entry %s", entry_id[:8]
                )

        # Persist edges — delete old ones first, then bulk insert
        if scope and scope_id:
            # Delete edges for entries in this scope
            entry_ids = [e.id for e in entries]
            await self.db.execute(
                delete(MemoryEdge).where(
                    MemoryEdge.source_id.in_(entry_ids)
                    | MemoryEdge.target_id.in_(entry_ids)
                )
            )
        else:
            # Full rebuild — delete all edges
            await self.db.execute(delete(MemoryEdge))

        # Bulk insert new edges
        new_edges = []
        for (src, tgt), data in edge_set.items():
            new_edges.append(
                MemoryEdge(
                    id=str(uuid4()),
                    source_id=src,
                    target_id=tgt,
                    edge_type=data["edge_type"],
                    weight=data["weight"],
                    shared_entities=data["shared_entities"],
                )
            )

        if new_edges:
            self.db.add_all(new_edges)
            await self.db.flush()

        logger.info(
            "Graph builder: %d edges created from %d entries",
            len(new_edges),
            len(entries),
        )
        return len(new_edges)

    async def rebuild_all(self) -> int:
        """Drop all edges and rebuild from scratch."""
        await self.db.execute(delete(MemoryEdge))
        return await self.build_edges()

    async def incremental_update(self, entry_ids: list[str]) -> int:
        """Recompute edges for specific entries only."""
        if not entry_ids:
            return 0

        # Delete existing edges involving these entries
        await self.db.execute(
            delete(MemoryEdge).where(
                MemoryEdge.source_id.in_(entry_ids)
                | MemoryEdge.target_id.in_(entry_ids)
            )
        )

        # Rebuild (full scope) — for simplicity, rebuild everything
        # A more optimized version could rebuild only the affected neighborhood
        return await self.build_edges()
