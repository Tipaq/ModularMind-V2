"""
RAG repository.

Database operations for RAG collections, documents, and chunks.
Vector search delegated to Qdrant via QdrantRAGVectorStore.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from qdrant_client import models as qmodels
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import RAGChunk, RAGCollection, RAGDocument, RAGScope
from .vector_store import QdrantRAGVectorStore, RAGSearchResult as QdrantSearchResult

if TYPE_CHECKING:
    from src.rag.reranker import BaseReranker

logger = logging.getLogger(__name__)


class RAGSearchResult:
    """RAG search result (hydrated from Qdrant + PG document metadata)."""

    def __init__(
        self,
        score: float,
        content: str = "",
        chunk_id: str = "",
        document_id: str = "",
        collection_id: str = "",
        chunk_index: int = 0,
        document: RAGDocument | None = None,
    ):
        self.score = score
        self.content = content
        self.chunk_id = chunk_id
        self.document_id = document_id
        self.collection_id = collection_id
        self.chunk_index = chunk_index
        self.document = document


class RAGRepository:
    """Repository for RAG operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._vector_store = QdrantRAGVectorStore()

    async def get_collection(self, collection_id: str) -> RAGCollection | None:
        """Get collection by ID."""
        result = await self.db.execute(
            select(RAGCollection).where(RAGCollection.id == collection_id)
        )
        return result.scalar_one_or_none()

    async def list_collections(self) -> list[RAGCollection]:
        """List all available collections."""
        result = await self.db.execute(
            select(RAGCollection).order_by(RAGCollection.name)
        )
        return list(result.scalars().all())

    async def list_collections_for_user(
        self, user_id: str, user_groups: list[str],
    ) -> list[RAGCollection]:
        """Return collections accessible to this user based on scope.

        GLOBAL — everyone can access.
        GROUP  — only users whose groups overlap with allowed_groups.
        AGENT  — only the owner user.
        """
        conditions = [RAGCollection.scope == RAGScope.GLOBAL]

        if user_groups:
            conditions.append(
                and_(
                    RAGCollection.scope == RAGScope.GROUP,
                    RAGCollection.allowed_groups.overlap(user_groups),
                )
            )

        conditions.append(
            and_(
                RAGCollection.scope == RAGScope.AGENT,
                RAGCollection.owner_user_id == user_id,
            )
        )

        query = (
            select(RAGCollection)
            .where(or_(*conditions))
            .order_by(RAGCollection.name)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def can_access_collection(
        self, collection_id: str, user_id: str, user_groups: list[str],
    ) -> bool:
        """Check if a user can access a specific collection (single query)."""
        conditions = [RAGCollection.scope == RAGScope.GLOBAL]
        if user_groups:
            conditions.append(
                and_(
                    RAGCollection.scope == RAGScope.GROUP,
                    RAGCollection.allowed_groups.overlap(user_groups),
                )
            )
        conditions.append(
            and_(
                RAGCollection.scope == RAGScope.AGENT,
                RAGCollection.owner_user_id == user_id,
            )
        )
        result = await self.db.execute(
            select(func.count()).select_from(RAGCollection).where(
                RAGCollection.id == collection_id,
                or_(*conditions),
            )
        )
        return (result.scalar() or 0) > 0

    async def search_hybrid(
        self,
        query_embedding: list[float],
        query_text: str,
        user_id: str,
        user_groups: list[str],
        *,
        collection_ids: list[str] | None = None,
        limit: int = 10,
        threshold: float = 0.0,
        reranker: BaseReranker | None = None,
    ) -> list[RAGSearchResult]:
        """Hybrid search via Qdrant with double-gate ACL.

        1. PG gate: fetch accessible collection_ids for the user.
        2. Qdrant gate: payload filter on collection_id + scope.
        """
        accessible = await self.list_collections_for_user(user_id, user_groups)
        accessible_ids = {c.id for c in accessible}

        if collection_ids:
            accessible_ids = accessible_ids & set(collection_ids)

        if not accessible_ids:
            return []

        payload_filter = qmodels.Filter(
            must=[
                qmodels.FieldCondition(
                    key="collection_id",
                    match=qmodels.MatchAny(any=list(accessible_ids)),
                ),
            ]
        )

        qdrant_results = await self._vector_store.search(
            query_embedding=query_embedding,
            query_text=query_text,
            filters=payload_filter,
            limit=limit,
            threshold=threshold,
            reranker=reranker,
        )

        if not qdrant_results:
            return []

        # Batch load all documents in a single query (fixes N+1)
        doc_ids = {qr.document_id for qr in qdrant_results}
        result = await self.db.execute(
            select(RAGDocument).where(RAGDocument.id.in_(doc_ids))
        )
        doc_map = {doc.id: doc for doc in result.scalars().all()}

        return [
            RAGSearchResult(
                score=qr.score,
                content=qr.content,
                chunk_id=qr.chunk_id,
                document_id=qr.document_id,
                collection_id=qr.collection_id,
                chunk_index=qr.chunk_index,
                document=doc_map.get(qr.document_id),
            )
            for qr in qdrant_results
        ]

    async def get_document(self, document_id: str) -> RAGDocument | None:
        """Get document by ID."""
        result = await self.db.execute(
            select(RAGDocument).where(RAGDocument.id == document_id)
        )
        return result.scalar_one_or_none()

    async def list_documents(self, collection_id: str) -> list[RAGDocument]:
        """List documents in a collection."""
        result = await self.db.execute(
            select(RAGDocument)
            .where(RAGDocument.collection_id == collection_id)
            .order_by(RAGDocument.filename)
        )
        return list(result.scalars().all())

    async def get_chunk(self, chunk_id: str) -> RAGChunk | None:
        """Get chunk by ID."""
        result = await self.db.execute(
            select(RAGChunk).where(RAGChunk.id == chunk_id)
        )
        return result.scalar_one_or_none()

    async def get_document_chunks(
        self,
        document_id: str,
        limit: int | None = None,
    ) -> list[RAGChunk]:
        """Get chunks for a document."""
        query = (
            select(RAGChunk)
            .where(RAGChunk.document_id == document_id)
            .order_by(RAGChunk.chunk_index)
        )

        if limit:
            query = query.limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())
