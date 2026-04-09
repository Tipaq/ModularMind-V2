"""RAG admin endpoints — stats, explorer, knowledge graph."""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from src.auth import RequireAdmin
from src.infra.database import DbSession
from src.infra.pagination import PaginationParams, get_pagination

from .models import RAGChunk, RAGCollection, RAGDocument
from .schemas import (
    ExplorerChunkListResponse,
    ExplorerChunkResponse,
    KnowledgeGlobalStatsResponse,
    KnowledgeGraphEdge,
    KnowledgeGraphNode,
    KnowledgeGraphResponse,
)

logger = logging.getLogger(__name__)

admin_rag_router = APIRouter(prefix="/rag", tags=["RAG Admin"])


@admin_rag_router.get(
    "/admin/stats/global",
    response_model=KnowledgeGlobalStatsResponse,
    dependencies=[RequireAdmin],
)
async def get_knowledge_global_stats(db: DbSession) -> KnowledgeGlobalStatsResponse:
    """Get aggregate knowledge stats across all collections (admin only)."""
    col_count = await db.execute(select(func.count(RAGCollection.id)))
    doc_count = await db.execute(select(func.count(RAGDocument.id)))

    chunk_agg = await db.execute(
        select(
            func.count(RAGChunk.id).label("total"),
            func.coalesce(func.sum(RAGChunk.access_count), 0).label("accesses"),
        )
    )
    chunk_row = chunk_agg.one()

    status_result = await db.execute(
        select(RAGDocument.status, func.count(RAGDocument.id)).group_by(RAGDocument.status)
    )
    docs_by_status = {row[0]: row[1] for row in status_result.all()}

    scope_result = await db.execute(
        select(RAGCollection.scope, func.count(RAGCollection.id)).group_by(RAGCollection.scope)
    )
    cols_by_scope = {
        row[0].value if hasattr(row[0], "value") else str(row[0]): row[1]
        for row in scope_result.all()
    }

    return KnowledgeGlobalStatsResponse(
        total_collections=col_count.scalar() or 0,
        total_documents=doc_count.scalar() or 0,
        total_chunks=int(chunk_row.total or 0),
        total_accesses=int(chunk_row.accesses or 0),
        documents_by_status=docs_by_status,
        collections_by_scope=cols_by_scope,
    )


@admin_rag_router.get(
    "/admin/explore",
    response_model=ExplorerChunkListResponse,
    dependencies=[RequireAdmin],
)
async def explore_knowledge(
    db: DbSession,
    pagination: PaginationParams = Depends(get_pagination),
    collection_id: str | None = Query(default=None),
    document_id: str | None = Query(default=None),
) -> ExplorerChunkListResponse:
    """Paginated chunk browser with filters (admin only)."""
    base = (
        select(
            RAGChunk,
            RAGCollection.name.label("collection_name"),
            RAGDocument.filename.label("document_filename"),
        )
        .join(RAGDocument, RAGChunk.document_id == RAGDocument.id)
        .join(RAGCollection, RAGChunk.collection_id == RAGCollection.id)
    )
    count_base = select(func.count(RAGChunk.id))

    filters = []
    if collection_id:
        filters.append(RAGChunk.collection_id == collection_id)
    if document_id:
        filters.append(RAGChunk.document_id == document_id)

    if filters:
        base = base.where(*filters)
        count_base = count_base.where(*filters)

    total_result = await db.execute(count_base)
    total = total_result.scalar() or 0

    rows = await db.execute(
        base.order_by(RAGChunk.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.page_size)
    )

    items = [
        ExplorerChunkResponse(
            id=chunk.id,
            content=chunk.content[:500],
            chunk_index=chunk.chunk_index,
            collection_id=chunk.collection_id,
            collection_name=col_name,
            document_id=chunk.document_id,
            document_filename=doc_filename,
            access_count=chunk.access_count,
            last_accessed=chunk.last_accessed,
            created_at=chunk.created_at,
        )
        for chunk, col_name, doc_filename in rows.all()
    ]

    return ExplorerChunkListResponse(
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@admin_rag_router.get(
    "/admin/graph",
    response_model=KnowledgeGraphResponse,
    dependencies=[RequireAdmin],
)
async def get_knowledge_graph(
    db: DbSession,
    limit: int = Query(default=200, ge=1, le=1000),
) -> KnowledgeGraphResponse:
    """Get knowledge graph data at document level (admin only)."""
    collections = await db.execute(
        select(RAGCollection).order_by(RAGCollection.name).limit(limit)
    )
    col_list = list(collections.scalars().all())

    nodes: list[KnowledgeGraphNode] = []
    edges: list[KnowledgeGraphEdge] = []

    col_ids = set()
    for c in col_list:
        col_ids.add(c.id)
        nodes.append(
            KnowledgeGraphNode(
                id=f"col:{c.id}",
                label=c.name,
                node_type="collection",
                scope=c.scope.value if hasattr(c.scope, "value") else str(c.scope),
                chunk_count=c.chunk_count,
                size=max(8, min(30, 8 + c.document_count * 2)),
            )
        )

    if col_ids:
        docs = await db.execute(
            select(RAGDocument)
            .where(RAGDocument.collection_id.in_(col_ids))
            .order_by(RAGDocument.chunk_count.desc())
            .limit(limit)
        )
        for d in docs.scalars().all():
            nodes.append(
                KnowledgeGraphNode(
                    id=f"doc:{d.id}",
                    label=d.filename,
                    node_type="document",
                    status=d.status,
                    chunk_count=d.chunk_count,
                    size=max(4, min(20, 4 + d.chunk_count)),
                )
            )
            edges.append(
                KnowledgeGraphEdge(
                    source=f"col:{d.collection_id}",
                    target=f"doc:{d.id}",
                    weight=max(0.5, min(3.0, d.chunk_count / 10)),
                )
            )

    return KnowledgeGraphResponse(nodes=nodes, edges=edges)
