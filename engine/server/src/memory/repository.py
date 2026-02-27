"""
Memory repository.

Implements IMemoryRepository for database operations.
Delegates vector search to QdrantMemoryVectorStore.
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.memory import MemoryStats

from .models import MemoryEntry, MemoryScope, MemoryTier
from .vector_store import QdrantMemoryVectorStore

logger = logging.getLogger(__name__)


class MemoryRepository:
    """Repository for memory operations using PostgreSQL + Qdrant."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._vector_store = QdrantMemoryVectorStore()

    async def create_entry(
        self,
        scope: MemoryScope,
        scope_id: str,
        content: str,
        embedding: list[float] | None = None,
        tier: MemoryTier = MemoryTier.BUFFER,
        metadata: dict | None = None,
        user_id: str | None = None,
        importance: float = 0.5,
    ) -> MemoryEntry:
        """Create a new memory entry in PG and upsert to Qdrant."""
        entry_id = str(uuid4())
        entry = MemoryEntry(
            id=entry_id,
            scope=scope,
            scope_id=scope_id,
            user_id=user_id,
            content=content,
            tier=tier,
            importance=importance,
            meta=metadata or {},
        )
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)

        # Upsert embedding to Qdrant if provided
        if embedding:
            try:
                await self._vector_store.upsert_entry(
                    entry_id=entry_id,
                    embedding=embedding,
                    content=content,
                    scope=scope.value,
                    scope_id=scope_id,
                    user_id=user_id or "",
                    importance=importance,
                    metadata=metadata or {},
                )
            except Exception as e:
                logger.error("Qdrant upsert failed for memory %s: %s", entry_id, e)

        return entry

    async def get_entry(self, entry_id: str) -> MemoryEntry | None:
        """Get memory entry by ID."""
        result = await self.db.execute(
            select(MemoryEntry).where(MemoryEntry.id == entry_id)
        )
        return result.scalar_one_or_none()

    async def get_recent_entries(
        self,
        scope: MemoryScope,
        scope_id: str,
        limit: int = 10,
        tier: MemoryTier | None = None,
        offset: int = 0,
    ) -> list[MemoryEntry]:
        """Get recent memory entries with SQL OFFSET/LIMIT pagination."""
        query = select(MemoryEntry).where(
            MemoryEntry.scope == scope,
            MemoryEntry.scope_id == scope_id,
        )

        if tier:
            query = query.where(MemoryEntry.tier == tier)

        query = query.order_by(MemoryEntry.created_at.desc())
        if offset > 0:
            query = query.offset(offset)
        query = query.limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def search_hybrid(
        self,
        query_embedding: list[float],
        query_text: str,
        user_id: str,
        scope: MemoryScope | None = None,
        scope_id: str | None = None,
        limit: int = 10,
        threshold: float = 0.7,
    ) -> list[tuple[MemoryEntry, float]]:
        """Hybrid search via Qdrant, enriched with PG metadata."""
        qdrant_results = await self._vector_store.search(
            query_embedding=query_embedding,
            query_text=query_text,
            user_id=user_id,
            scope=scope.value if scope else None,
            scope_id=scope_id,
            limit=limit,
            threshold=threshold,
        )

        if not qdrant_results:
            return []

        # Enrich with PG metadata (tier, access_count, last_accessed)
        point_ids = [r.point_id for r in qdrant_results]
        result = await self.db.execute(
            select(MemoryEntry).where(MemoryEntry.id.in_(point_ids))
        )
        entries_by_id = {e.id: e for e in result.scalars().all()}

        enriched: list[tuple[MemoryEntry, float]] = []
        for r in qdrant_results:
            entry = entries_by_id.get(r.point_id)
            if entry:
                enriched.append((entry, r.score))

        return enriched

    async def update_access(self, entry_id: str) -> None:
        """Atomically increment access count and update timestamp."""
        await self.db.execute(
            update(MemoryEntry)
            .where(MemoryEntry.id == entry_id)
            .values(
                access_count=MemoryEntry.access_count + 1,
                last_accessed=datetime.now(timezone.utc),
            )
        )
        await self.db.flush()

    async def delete_entry(self, entry_id: str) -> bool:
        """Delete a memory entry from PG."""
        entry = await self.get_entry(entry_id)
        if not entry:
            return False

        await self.db.delete(entry)
        await self.db.flush()
        return True

    async def get_stats(self, scope: MemoryScope, scope_id: str) -> MemoryStats:
        """Get memory statistics for a scope in a single query."""
        base_filter = [MemoryEntry.scope == scope, MemoryEntry.scope_id == scope_id]

        stats_query = select(
            MemoryEntry.tier,
            func.count(MemoryEntry.id).label("cnt"),
            func.min(MemoryEntry.created_at).label("oldest"),
            func.max(MemoryEntry.created_at).label("newest"),
        ).where(*base_filter).group_by(MemoryEntry.tier)

        result = await self.db.execute(stats_query)
        rows = result.all()

        tier_counts = {tier.value: 0 for tier in MemoryTier}
        oldest = None
        newest = None

        for row in rows:
            tier_counts[row.tier.value] = row.cnt
            if oldest is None or (row.oldest and row.oldest < oldest):
                oldest = row.oldest
            if newest is None or (row.newest and row.newest > newest):
                newest = row.newest

        return MemoryStats(
            total_entries=sum(tier_counts.values()),
            entries_by_tier=tier_counts,
            oldest_entry=oldest,
            newest_entry=newest,
        )
