"""
Memory Consolidator.

Handles:
- Exponential decay with type-specific half-lives
- LLM-driven consolidation (merge/invalidate/keep)
- Episodic-to-semantic promotion
"""

import logging
from collections import defaultdict
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.config import Settings
from src.infra.utils import utcnow

from .models import ConsolidationLog, MemoryEntry, MemoryType
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

    Creates ConsolidationLog entries per scope for audit trail.

    Returns:
        Tuple of (decayed_count, invalidated_count).
    """
    now = utcnow()
    prune_threshold = settings.MEMORY_DECAY_PRUNE_THRESHOLD
    vector_store = QdrantMemoryVectorStore()

    decayed = 0
    invalidated = 0

    # Track per-scope results for logging
    scope_decayed: dict[tuple[str, str], list[str]] = defaultdict(list)
    scope_invalidated: dict[tuple[str, str], list[dict]] = defaultdict(list)

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
            old_importance = entry.importance
            new_importance = old_importance * decay_factor
            scope_key = (entry.scope.value, entry.scope_id)

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
                scope_invalidated[scope_key].append({
                    "id": entry.id,
                    "old": round(old_importance, 4),
                    "new": round(new_importance, 4),
                    "type": memory_type.value,
                })
                invalidated += 1
            else:
                # Just update importance
                await session.execute(
                    update(MemoryEntry)
                    .where(MemoryEntry.id == entry.id)
                    .values(importance=new_importance)
                )
                scope_decayed[scope_key].append(entry.id)
                decayed += 1

    # Create ConsolidationLog entries per scope for invalidated entries
    for (scope_val, scope_id), inv_entries in scope_invalidated.items():
        log = ConsolidationLog(
            id=str(uuid4()),
            scope=scope_val,
            scope_id=scope_id,
            action="invalidated",
            source_entry_ids=[e["id"] for e in inv_entries],
            details={
                "reason": (
                    f"Pruned {len(inv_entries)} entries below "
                    f"threshold ({prune_threshold})"
                ),
                "threshold": prune_threshold,
                "entries": inv_entries[:10],
            },
        )
        session.add(log)

    # Create ConsolidationLog entries per scope for decayed entries
    for (scope_val, scope_id), entry_ids in scope_decayed.items():
        log = ConsolidationLog(
            id=str(uuid4()),
            scope=scope_val,
            scope_id=scope_id,
            action="decayed",
            source_entry_ids=entry_ids,
            details={
                "reason": f"Exponential decay applied to {len(entry_ids)} entries",
                "count": len(entry_ids),
            },
        )
        session.add(log)

    await session.flush()

    logger.info(
        "Decay complete: %d entries decayed, %d entries invalidated",
        decayed,
        invalidated,
    )
    return decayed, invalidated
