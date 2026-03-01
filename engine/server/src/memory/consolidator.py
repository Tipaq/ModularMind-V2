"""
Memory Consolidator.

Handles:
- Exponential decay with type-specific half-lives
- LLM-driven consolidation (merge/invalidate/keep)
- Episodic-to-semantic promotion
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.config import Settings

from .models import MemoryEntry, MemoryType
from .vector_store import QdrantMemoryVectorStore

logger = logging.getLogger(__name__)

# Half-life mapping: memory_type -> settings attribute name
_HALF_LIFE_SETTINGS = {
    MemoryType.EPISODIC: "MEMORY_DECAY_EPISODIC_HALF_LIFE",
    MemoryType.SEMANTIC: "MEMORY_DECAY_SEMANTIC_HALF_LIFE",
    MemoryType.PROCEDURAL: "MEMORY_DECAY_PROCEDURAL_HALF_LIFE",
}


async def apply_exponential_decay(
    session: AsyncSession,
    settings: Settings,
) -> tuple[int, int]:
    """Apply exponential decay to all active memory entries.

    Uses COALESCE(last_accessed, created_at) as reference date for entries
    that have never been accessed.

    Returns:
        Tuple of (decayed_count, invalidated_count).
    """
    now = datetime.now(UTC).replace(tzinfo=None)
    prune_threshold = settings.MEMORY_DECAY_PRUNE_THRESHOLD
    vector_store = QdrantMemoryVectorStore()

    decayed = 0
    invalidated = 0

    for memory_type, setting_name in _HALF_LIFE_SETTINGS.items():
        half_life = getattr(settings, setting_name)

        # Fetch entries of this type that are not expired
        result = await session.execute(
            select(MemoryEntry).where(
                MemoryEntry.memory_type == memory_type,
                MemoryEntry.expired_at.is_(None),
            )
        )
        entries = list(result.scalars().all())

        for entry in entries:
            # Use last_accessed if available, otherwise created_at
            ref_date = entry.last_accessed or entry.created_at
            days_since = (now - ref_date).total_seconds() / 86400

            if days_since <= 0:
                continue

            # Exponential decay: importance *= 0.5 ^ (days / half_life)
            decay_factor = 0.5 ** (days_since / half_life)
            new_importance = entry.importance * decay_factor

            if new_importance < prune_threshold:
                # Invalidate (soft-delete)
                await session.execute(
                    update(MemoryEntry)
                    .where(MemoryEntry.id == entry.id)
                    .values(
                        importance=new_importance,
                        expired_at=now,
                    )
                )
                # Best-effort Qdrant update
                try:
                    await vector_store.set_expired(entry.id)
                except Exception as e:
                    logger.error(
                        "Qdrant invalidation failed for %s: %s", entry.id, e
                    )
                invalidated += 1
            else:
                # Just update importance
                await session.execute(
                    update(MemoryEntry)
                    .where(MemoryEntry.id == entry.id)
                    .values(importance=new_importance)
                )
                decayed += 1

    await session.flush()

    logger.info(
        "Decay complete: %d entries decayed, %d entries invalidated",
        decayed,
        invalidated,
    )
    return decayed, invalidated
