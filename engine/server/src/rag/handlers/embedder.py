"""RAG document embedder handler (Stage 2).

Reads chunk IDs from the stream, loads chunk contents from PG, generates
embeddings, and stores them in the `embedding_cache` JSONB column.
Publishes to `rag:embedded` for the storer stage.

Stream: rag:extracted -> embedder -> rag:embedded
"""

import logging

from sqlalchemy import select

from src.infra.database import async_session_maker
from src.rag.models import RAGChunk

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100


async def document_embed_handler(data: dict) -> None:
    """Generate embeddings for extracted chunks."""
    document_id = data.get("document_id", "")
    collection_id = data.get("collection_id", "")
    chunk_ids_csv = data.get("chunk_ids", "")

    if not chunk_ids_csv:
        logger.error("Embedder: no chunk_ids in message")
        return

    chunk_ids = [cid.strip() for cid in chunk_ids_csv.split(",") if cid.strip()]
    if not chunk_ids:
        return

    async with async_session_maker() as session:
        # Load chunk contents from PG
        result = await session.execute(
            select(RAGChunk.id, RAGChunk.content).where(RAGChunk.id.in_(chunk_ids))
        )
        rows = list(result.all())

        if not rows:
            logger.warning("Embedder: no chunks found for IDs %s", chunk_ids[:3])
            return

        # Get embedding provider
        from src.embedding.resolver import get_knowledge_embedding_provider

        embedding_provider = get_knowledge_embedding_provider()
        if not embedding_provider:
            logger.error("Embedder: no embedding provider available")
            return

        # Batch embed
        id_list = [row[0] for row in rows]
        texts = [row[1] for row in rows]

        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i : i + _BATCH_SIZE]
            batch_embeddings = await embedding_provider.embed_texts(batch)
            all_embeddings.extend(batch_embeddings)

        # Store embeddings in PG embedding_cache column (batch load)
        chunk_result = await session.execute(
            select(RAGChunk).where(RAGChunk.id.in_(id_list))
        )
        chunk_map = {c.id: c for c in chunk_result.scalars().all()}
        for j, cid in enumerate(id_list):
            chunk = chunk_map.get(cid)
            if chunk:
                chunk.embedding_cache = {"embedding": all_embeddings[j]}

        await session.commit()

        logger.info(
            "Embedder: generated %d embeddings for document %s",
            len(all_embeddings),
            document_id,
        )

    # Publish to next stage
    from src.infra.publish import get_event_bus

    bus = await get_event_bus()
    await bus.publish(
        "rag:embedded",
        {
            "document_id": document_id,
            "collection_id": collection_id,
            "chunk_ids": chunk_ids_csv,
        },
    )
