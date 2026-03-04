"""Pipeline monitoring and actions — Memory and Knowledge pipeline visibility."""

import logging
import os
from datetime import datetime

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update

from src.auth import CurrentUser, RequireAdmin
from src.infra.database import DbSession

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Internal"])


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------


class StreamGroupInfo(BaseModel):
    name: str
    pending: int
    consumers: int


class StreamDetail(BaseModel):
    length: int
    groups: list[StreamGroupInfo] = Field(default_factory=list)


class DLQMessage(BaseModel):
    id: str
    original_stream: str
    original_id: str
    error: str
    data: str


class MemoryPipelineData(BaseModel):
    memory_raw: StreamDetail
    memory_extracted: StreamDetail
    memory_scored: StreamDetail | None = None
    memory_dlq: StreamDetail
    scorer_enabled: bool = True
    total_entries: int = 0
    entries_by_tier: dict[str, int] = Field(default_factory=dict)
    entries_by_type: dict[str, int] = Field(default_factory=dict)
    avg_importance: float = 0.0


class DocumentStatusCounts(BaseModel):
    pending: int = 0
    processing: int = 0
    ready: int = 0
    failed: int = 0
    total: int = 0


class ActiveDocument(BaseModel):
    id: str
    filename: str
    collection_id: str
    collection_name: str
    status: str
    error_message: str | None = None
    size_bytes: int | None = None
    created_at: datetime


class KnowledgePipelineData(BaseModel):
    documents_stream: StreamDetail
    status_counts: DocumentStatusCounts
    active_documents: list[ActiveDocument] = Field(default_factory=list)


class PipelineCounters(BaseModel):
    facts_extracted_total: int = 0
    embeddings_stored_total: int = 0


class PipelinesResponse(BaseModel):
    memory: MemoryPipelineData
    knowledge: KnowledgePipelineData
    dlq_messages: list[DLQMessage] = Field(default_factory=list)
    counters: PipelineCounters


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
    """Aggregate all pipeline data: memory streams, document status, DLQ, counters."""
    from src.infra.config import get_settings
    from src.infra.redis import get_redis_pool
    from src.infra.redis_streams import RedisStreamBus
    from src.memory.models import MemoryEntry, MemoryTier, MemoryType
    from src.rag.models import RAGCollection, RAGDocument

    settings = get_settings()
    pool = get_redis_pool()
    bus = RedisStreamBus(aioredis.Redis(connection_pool=pool))

    # --- Stream info ---
    memory_raw = await _get_stream_detail(bus, "memory:raw")
    memory_extracted = await _get_stream_detail(bus, "memory:extracted")
    memory_dlq = await _get_stream_detail(bus, "memory:dlq")
    documents_stream = await _get_stream_detail(bus, "tasks:documents")

    memory_scored = None
    if settings.MEMORY_SCORER_ENABLED:
        memory_scored = await _get_stream_detail(bus, "memory:scored")

    # --- DLQ recent messages (last 20) ---
    dlq_messages: list[DLQMessage] = []
    try:
        r = aioredis.Redis(connection_pool=pool)
        raw_entries = await r.xrevrange("memory:dlq", count=20)
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

    # --- Memory stats ---
    tier_result = await db.execute(
        select(MemoryEntry.tier, func.count(MemoryEntry.id))
        .where(MemoryEntry.expired_at.is_(None))
        .group_by(MemoryEntry.tier)
    )
    entries_by_tier = {t.value: 0 for t in MemoryTier}
    for row in tier_result.all():
        entries_by_tier[row[0].value] = row[1]

    type_result = await db.execute(
        select(MemoryEntry.memory_type, func.count(MemoryEntry.id))
        .where(MemoryEntry.expired_at.is_(None))
        .group_by(MemoryEntry.memory_type)
    )
    entries_by_type = {mt.value: 0 for mt in MemoryType}
    for row in type_result.all():
        entries_by_type[row[0].value] = row[1]

    agg_result = await db.execute(
        select(func.avg(MemoryEntry.importance))
        .where(MemoryEntry.expired_at.is_(None))
    )
    avg_importance = float(agg_result.scalar() or 0)
    total_entries = sum(entries_by_tier.values())

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

    # --- Prometheus counters ---
    counters = PipelineCounters()
    try:
        from src.infra.metrics import pipeline_embeddings_stored, pipeline_facts_extracted

        counters.facts_extracted_total = int(pipeline_facts_extracted._value.get())
        counters.embeddings_stored_total = int(pipeline_embeddings_stored._value.get())
    except Exception:
        logger.debug("Prometheus counters unavailable (e.g. multiprocess mode)")

    return PipelinesResponse(
        memory=MemoryPipelineData(
            memory_raw=memory_raw,
            memory_extracted=memory_extracted,
            memory_scored=memory_scored,
            memory_dlq=memory_dlq,
            scorer_enabled=settings.MEMORY_SCORER_ENABLED,
            total_entries=total_entries,
            entries_by_tier=entries_by_tier,
            entries_by_type=entries_by_type,
            avg_importance=round(avg_importance, 3),
        ),
        knowledge=KnowledgePipelineData(
            documents_stream=documents_stream,
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
        await r.xtrim("memory:dlq", maxlen=0)
        logger.info("DLQ purged by admin %s", user.id)
        return {"status": "purged"}
    except Exception as e:
        logger.error("Failed to purge DLQ: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to purge DLQ: {e}") from e


# ---------------------------------------------------------------------------
# POST /pipelines/memory/extract
# ---------------------------------------------------------------------------


@router.post("/pipelines/memory/extract", dependencies=[RequireAdmin])
async def trigger_memory_extraction(user: CurrentUser) -> dict[str, str]:
    """Trigger an immediate memory extraction scan (bypass cooldown lock)."""
    import contextlib

    from src.infra.redis import redis_client
    from src.worker.scheduler import memory_extraction_scan

    # Remove the cooldown lock so the scan runs immediately

    with contextlib.suppress(Exception):
        await redis_client.delete("memory:extraction_scan:lock")

    await memory_extraction_scan()

    logger.info("Memory extraction scan triggered by admin %s", user.id)
    return {"status": "triggered"}
