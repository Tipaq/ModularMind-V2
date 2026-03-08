"""RAG consolidator — periodic decay and obsolescence detection.

Chunk dedup is handled at store time (storer handler), NOT here.
This module only handles:
1. Usage decay — flag chunks with zero access after N days
2. Document obsolescence — detect duplicate filenames with newer versions
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.rag.models import RAGChunk, RAGDocument

logger = logging.getLogger(__name__)


class RAGConsolidator:
    """Periodic RAG data maintenance."""

    async def decay_unused_chunks(
        self,
        db: AsyncSession,
        days_threshold: int = 30,
        batch_limit: int = 1000,
    ) -> int:
        """Flag or remove chunks that have never been accessed after N days.

        Returns the number of chunks affected.
        """
        cutoff = datetime.utcnow() - timedelta(days=days_threshold)

        result = await db.execute(
            select(RAGChunk.id)
            .where(
                RAGChunk.access_count == 0,
                RAGChunk.created_at < cutoff,
            )
            .limit(batch_limit)
        )
        chunk_ids = [row[0] for row in result.all()]

        if not chunk_ids:
            return 0

        # For now, just log. Future: reduce Qdrant importance or soft-delete.
        logger.info(
            "Decay: found %d unused chunks older than %d days",
            len(chunk_ids),
            days_threshold,
        )

        # Mark as decayed in metadata
        await db.execute(
            update(RAGChunk)
            .where(RAGChunk.id.in_(chunk_ids))
            .values(
                meta=func.jsonb_set(
                    func.coalesce(RAGChunk.meta, func.cast("{}", RAGChunk.meta.type)),
                    "{decayed}",
                    func.cast("true", RAGChunk.meta.type),
                )
            )
        )

        return len(chunk_ids)

    async def detect_obsolete_documents(
        self,
        collection_id: str,
        db: AsyncSession,
    ) -> list[str]:
        """Find documents with duplicate filenames (older versions are obsolete).

        Returns list of obsolete document IDs.
        """
        # Find filenames with multiple documents
        result = await db.execute(
            select(
                RAGDocument.filename,
                func.array_agg(
                    RAGDocument.id,
                    type_=None,
                ).label("doc_ids"),
            )
            .where(RAGDocument.collection_id == collection_id)
            .group_by(RAGDocument.filename)
            .having(func.count(RAGDocument.id) > 1)
        )
        rows = result.all()

        obsolete_ids: list[str] = []
        for _filename, doc_ids in rows:
            if not doc_ids or len(doc_ids) < 2:
                continue

            # Get documents ordered by creation date (newest first)
            docs_result = await db.execute(
                select(RAGDocument.id)
                .where(RAGDocument.id.in_(doc_ids))
                .order_by(RAGDocument.created_at.desc())
            )
            ordered_ids = [row[0] for row in docs_result.all()]

            # All but the newest are obsolete
            obsolete_ids.extend(ordered_ids[1:])

        if obsolete_ids:
            logger.info(
                "Obsolescence: found %d obsolete documents in collection %s",
                len(obsolete_ids),
                collection_id,
            )

        return obsolete_ids
