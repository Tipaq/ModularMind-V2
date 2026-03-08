"""RAG document storer handler (Stage 3 — terminal).

Reads chunk IDs from the stream, loads chunks + embeddings from PG,
performs dedup against existing Qdrant vectors, upserts non-duplicate
chunks to Qdrant, and cleans up the embedding_cache.

Stream: rag:embedded -> storer (terminal)
"""

import logging

from sqlalchemy import func, select, update

from src.infra.database import async_session_maker
from src.rag.models import DocumentStatus, RAGChunk, RAGCollection, RAGDocument

logger = logging.getLogger(__name__)

DEDUP_THRESHOLD = 0.95  # cosine similarity threshold for dedup


async def document_store_handler(data: dict) -> None:
    """Store embedded chunks to Qdrant with dedup."""
    document_id = data.get("document_id", "")
    collection_id = data.get("collection_id", "")
    chunk_ids_csv = data.get("chunk_ids", "")

    if not chunk_ids_csv:
        logger.error("Storer: no chunk_ids in message")
        return

    chunk_ids = [cid.strip() for cid in chunk_ids_csv.split(",") if cid.strip()]
    if not chunk_ids:
        return

    async with async_session_maker() as session:
        # Load chunks with embeddings from PG
        result = await session.execute(select(RAGChunk).where(RAGChunk.id.in_(chunk_ids)))
        chunks = list(result.scalars().all())

        if not chunks:
            logger.warning("Storer: no chunks found for IDs %s", chunk_ids[:3])
            return

        # Get Qdrant client for dedup check
        from src.rag.vector_store import ChunkData, QdrantRAGVectorStore

        vector_store = QdrantRAGVectorStore()
        client = await vector_store._get_client()

        # Fetch collection scope info for Qdrant payloads
        coll_result = await session.execute(
            select(RAGCollection).where(RAGCollection.id == collection_id)
        )
        coll = coll_result.scalar_one_or_none()
        scope = coll.scope.value if coll else "global"
        group_slugs = list(coll.allowed_groups) if coll else []
        agent_id = coll.owner_user_id if coll and coll.scope.value == "agent" else None

        # Dedup + build upsert list
        qdrant_chunks: list[ChunkData] = []
        dedup_count = 0

        for chunk in chunks:
            embedding_data = chunk.embedding_cache or {}
            embedding = embedding_data.get("embedding")
            if not embedding:
                logger.warning("Storer: chunk %s has no embedding, skipping", chunk.id)
                continue

            # Dedup: search Qdrant for similar existing chunks in same collection
            try:
                from qdrant_client.models import FieldCondition, Filter, MatchValue

                search_results = await client.search(
                    collection_name=vector_store.collection_name,
                    query_vector=("dense", embedding),
                    limit=5,
                    query_filter=Filter(
                        must=[
                            FieldCondition(
                                key="collection_id",
                                match=MatchValue(value=collection_id),
                            )
                        ]
                    ),
                    score_threshold=DEDUP_THRESHOLD,
                )
                if search_results:
                    dedup_count += 1
                    logger.debug(
                        "Storer: chunk %s dedup'd (score=%.3f)",
                        chunk.id,
                        search_results[0].score,
                    )
                    continue
            except Exception as e:
                # If dedup check fails, store the chunk anyway
                logger.warning("Storer: dedup check failed for chunk %s: %s", chunk.id, e)

            qdrant_chunks.append(
                ChunkData(
                    id=chunk.id,
                    content=chunk.content,
                    embedding=embedding,
                    scope=scope,
                    group_slugs=group_slugs,
                    agent_id=agent_id,
                    user_id=None,
                    document_id=document_id,
                    collection_id=collection_id,
                    chunk_index=chunk.chunk_index,
                    metadata=chunk.meta or {},
                )
            )

        # Upsert non-duplicate chunks to Qdrant
        stored = 0
        if qdrant_chunks:
            stored = await vector_store.upsert_chunks(qdrant_chunks)

        # Clean up embedding_cache on all processed chunks
        await session.execute(
            update(RAGChunk).where(RAGChunk.id.in_(chunk_ids)).values(embedding_cache=None)
        )

        # Update document status
        doc = await session.get(RAGDocument, document_id)
        if doc:
            doc.status = DocumentStatus.READY.value
            doc.chunk_count = len(chunks)

        # Update collection aggregate counts
        total_chunks = (
            await session.execute(
                select(func.count(RAGChunk.id)).where(RAGChunk.collection_id == collection_id)
            )
        ).scalar() or 0
        total_docs = (
            await session.execute(
                select(func.count(RAGDocument.id)).where(RAGDocument.collection_id == collection_id)
            )
        ).scalar() or 0

        await session.execute(
            update(RAGCollection)
            .where(RAGCollection.id == collection_id)
            .values(chunk_count=total_chunks, document_count=total_docs)
        )

        await session.commit()

        logger.info(
            "Storer: document %s complete — %d stored, %d dedup'd, %d total chunks",
            document_id,
            stored,
            dedup_count,
            len(chunks),
        )
