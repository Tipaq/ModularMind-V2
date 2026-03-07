"""Pipeline monitoring and actions — Knowledge pipeline visibility."""

import logging
import os

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, func, select, update

from src.auth import CurrentUser, RequireAdmin
from src.infra.database import DbSession
from src.internal.schemas import (
    ActiveDocument,
    DLQMessage,
    DocumentStatusCounts,
    KnowledgePipelineData,
    PipelineCounters,
    PipelinesResponse,
    StreamDetail,
    StreamGroupInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Internal"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_stream_detail(bus, stream: str) -> StreamDetail:
    info = await bus.stream_info(stream)
    return StreamDetail(
        length=info.get("length", 0),
        groups=[StreamGroupInfo(**g) for g in info.get("groups", [])],
    )


# ---------------------------------------------------------------------------
# GET /pipelines — aggregated pipeline data
# ---------------------------------------------------------------------------


@router.get("/pipelines", dependencies=[RequireAdmin])
async def get_pipelines(user: CurrentUser, db: DbSession) -> PipelinesResponse:
    """Aggregate all pipeline data: document status, DLQ, counters."""
    from src.infra.redis import get_redis_pool
    from src.infra.redis_streams import RedisStreamBus
    from src.rag.models import RAGChunk, RAGCollection, RAGDocument

    pool = get_redis_pool()
    bus = RedisStreamBus(aioredis.Redis(connection_pool=pool))

    # --- Stream info ---
    documents_stream = await _get_stream_detail(bus, "tasks:documents")
    dlq_stream = await _get_stream_detail(bus, "pipeline:dlq")

    # --- DLQ recent messages (last 20) ---
    dlq_messages: list[DLQMessage] = []
    try:
        r = aioredis.Redis(connection_pool=pool)
        raw_entries = await r.xrevrange("pipeline:dlq", count=20)
        for msg_id, data in raw_entries:
            mid = msg_id if isinstance(msg_id, str) else msg_id.decode()
            dlq_messages.append(DLQMessage(
                id=mid,
                original_stream=_decode(data.get("original_stream", "")),
                original_id=_decode(data.get("original_id", "")),
                error=_decode(data.get("error", "")),
                data=_decode(data.get("data", "")),
            ))
    except Exception as e:
        logger.warning("Failed to read DLQ messages: %s", e)

    # --- Document status counts ---
    status_result = await db.execute(
        select(RAGDocument.status, func.count(RAGDocument.id))
        .group_by(RAGDocument.status)
    )
    counts = DocumentStatusCounts()
    for row in status_result.all():
        setattr(counts, row[0], row[1])
    counts.total = counts.pending + counts.processing + counts.ready + counts.failed

    # --- Active documents (processing + failed) ---
    active_result = await db.execute(
        select(
            RAGDocument.id,
            RAGDocument.filename,
            RAGDocument.collection_id,
            RAGCollection.name,
            RAGDocument.status,
            RAGDocument.error_message,
            RAGDocument.size_bytes,
            RAGDocument.created_at,
        )
        .join(RAGCollection, RAGCollection.id == RAGDocument.collection_id)
        .where(RAGDocument.status.in_(["pending", "processing", "failed"]))
        .order_by(RAGDocument.created_at.desc())
        .limit(100)
    )
    active_documents = [
        ActiveDocument(
            id=row[0],
            filename=row[1],
            collection_id=row[2],
            collection_name=row[3],
            status=row[4],
            error_message=row[5],
            size_bytes=row[6],
            created_at=row[7],
        )
        for row in active_result.all()
    ]

    # --- RAG chunk counters ---
    chunk_agg = await db.execute(
        select(
            func.count(RAGChunk.id).label("total"),
            func.coalesce(func.sum(RAGChunk.access_count), 0).label("accesses"),
        )
    )
    chunk_row = chunk_agg.one()

    counters = PipelineCounters(
        total_chunks=int(chunk_row.total or 0),
        total_chunk_accesses=int(chunk_row.accesses or 0),
    )

    return PipelinesResponse(
        knowledge=KnowledgePipelineData(
            documents_stream=documents_stream,
            dlq_stream=dlq_stream,
            status_counts=counts,
            active_documents=active_documents,
        ),
        dlq_messages=dlq_messages,
        counters=counters,
    )


def _decode(value: str | bytes) -> str:
    """Safely decode bytes to str."""
    return value.decode() if isinstance(value, bytes) else str(value)


# ---------------------------------------------------------------------------
# POST /pipelines/documents/{document_id}/retry
# ---------------------------------------------------------------------------


@router.post("/pipelines/documents/{document_id}/retry", dependencies=[RequireAdmin])
async def retry_document(
    document_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, str]:
    """Reset a failed document to PROCESSING and re-queue for processing."""
    from src.infra.publish import get_event_bus
    from src.rag.models import DocumentStatus, RAGChunk, RAGCollection, RAGDocument

    result = await db.execute(
        select(RAGDocument).where(RAGDocument.id == document_id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.status != DocumentStatus.FAILED.value:
        raise HTTPException(
            status_code=400,
            detail=f"Can only retry failed documents, current status: {document.status}",
        )

    # Get file_path from metadata
    file_path = (document.meta or {}).get("file_path", "")
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(
            status_code=400,
            detail="Original file no longer available. Please delete and re-upload.",
        )

    # Get collection for chunk settings
    col_result = await db.execute(
        select(RAGCollection).where(RAGCollection.id == document.collection_id)
    )
    collection = col_result.scalar_one_or_none()
    chunk_size = getattr(collection, "chunk_size", 500) or 500
    chunk_overlap = getattr(collection, "chunk_overlap", 50) or 50

    # Delete partial chunks if any
    await db.execute(
        delete(RAGChunk).where(RAGChunk.document_id == document_id)
    )

    # Reset status
    await db.execute(
        update(RAGDocument)
        .where(RAGDocument.id == document_id)
        .values(
            status=DocumentStatus.PROCESSING.value,
            error_message=None,
            chunk_count=0,
        )
    )
    await db.commit()

    # Best-effort Qdrant cleanup
    try:
        from src.rag.vector_store import QdrantRAGVectorStore

        vs = QdrantRAGVectorStore()
        await vs.delete_by_document(document_id)
    except Exception as e:
        logger.warning("Qdrant cleanup on retry failed for %s: %s", document_id, e)

    # Re-queue
    bus = await get_event_bus()
    await bus.publish("tasks:documents", {
        "collection_id": document.collection_id,
        "document_id": document_id,
        "file_path": file_path,
        "filename": document.filename,
        "chunk_size": str(chunk_size),
        "chunk_overlap": str(chunk_overlap),
    })

    logger.info("Document %s re-queued for processing by admin %s", document_id, user.id)
    return {"status": "retrying", "document_id": document_id}


# ---------------------------------------------------------------------------
# POST /pipelines/dlq/purge
# ---------------------------------------------------------------------------


@router.post("/pipelines/dlq/purge", dependencies=[RequireAdmin])
async def purge_dlq(user: CurrentUser) -> dict[str, str]:
    """Clear all messages in the dead-letter queue."""
    from src.infra.redis import get_redis_pool

    r = aioredis.Redis(connection_pool=get_redis_pool())
    try:
        await r.xtrim("pipeline:dlq", maxlen=0)
        logger.info("DLQ purged by admin %s", user.id)
        return {"status": "purged"}
    except Exception as e:
        logger.error("Failed to purge DLQ: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to purge DLQ: {e}") from e
