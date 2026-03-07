"""
RAG schemas.

Pydantic request/response models for RAG API endpoints.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse

from .models import RAGScope

# ─── Collection Schemas ──────────────────────────────────────────────────────


class CollectionCreate(BaseModel):
    """Collection creation request."""

    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    scope: RAGScope = RAGScope.GLOBAL
    allowed_groups: list[str] = Field(default_factory=list)
    owner_user_id: str | None = None


class CollectionResponse(BaseModel):
    """Collection response."""

    id: str
    name: str
    description: str
    document_count: int
    chunk_count: int
    chunk_size: int = 500
    chunk_overlap: int = 50
    last_sync: datetime | None
    created_at: datetime | None = None
    scope: str = "global"
    allowed_groups: list[str] = Field(default_factory=list)
    owner_user_id: str | None = None
    meta: dict | None = Field(default=None, serialization_alias="metadata")

    model_config = {"from_attributes": True}


class CollectionListResponse(PaginatedResponse[CollectionResponse]):
    """Collection list response."""


# ─── Document Schemas ────────────────────────────────────────────────────────


class DocumentResponse(BaseModel):
    """Document response."""

    id: str
    collection_id: str
    filename: str
    content_type: str | None
    size_bytes: int | None
    chunk_count: int
    status: str = "ready"
    error_message: str | None = None
    has_original: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_document(cls, doc) -> "DocumentResponse":
        """Build response from RAGDocument model, computing has_original."""
        meta = doc.meta or {}
        return cls(
            id=doc.id,
            collection_id=doc.collection_id,
            filename=doc.filename,
            content_type=doc.content_type,
            size_bytes=doc.size_bytes,
            chunk_count=doc.chunk_count,
            status=doc.status,
            error_message=doc.error_message,
            has_original=bool(meta.get("object_key")),
            created_at=doc.created_at,
        )


class DocumentListResponse(PaginatedResponse[DocumentResponse]):
    """Document list response."""


# ─── Search Schemas ──────────────────────────────────────────────────────────


class ChunkResponse(BaseModel):
    """Chunk response."""

    id: str
    document_id: str
    collection_id: str
    content: str
    chunk_index: int


class SearchRequest(BaseModel):
    """RAG search request."""

    query: str = Field(min_length=1, max_length=1000)
    collection_ids: list[str] | None = None
    limit: int = Field(default=10, ge=1, le=50)
    threshold: float = Field(default=0.7, ge=0, le=1)


class SearchResultItem(BaseModel):
    """Search result item."""

    chunk: ChunkResponse
    score: float
    document_filename: str | None


class SearchResponse(BaseModel):
    """RAG search response."""

    results: list[SearchResultItem]
    total: int
    search_mode: str = "hybrid"
    reranked: bool = False
    warning: str | None = None


# ─── Admin Schemas ──────────────────────────────────────────────────────────


class KnowledgeGlobalStatsResponse(BaseModel):
    """Global knowledge stats for admin dashboard."""

    total_collections: int
    total_documents: int
    total_chunks: int
    total_accesses: int
    documents_by_status: dict[str, int]
    collections_by_scope: dict[str, int]


class ExplorerChunkResponse(BaseModel):
    """Chunk entry for the admin explorer."""

    id: str
    content: str
    chunk_index: int
    collection_id: str
    collection_name: str
    document_id: str
    document_filename: str
    access_count: int
    last_accessed: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExplorerChunkListResponse(PaginatedResponse[ExplorerChunkResponse]):
    """Paginated chunk explorer response."""


class KnowledgeGraphNode(BaseModel):
    """Node in the knowledge graph (document or collection)."""

    id: str
    label: str
    node_type: str  # "collection" or "document"
    scope: str | None = None
    status: str | None = None
    chunk_count: int = 0
    size: int = 0  # visual size hint


class KnowledgeGraphEdge(BaseModel):
    """Edge in the knowledge graph."""

    source: str
    target: str
    weight: float = 1.0


class KnowledgeGraphResponse(BaseModel):
    """Knowledge graph response."""

    nodes: list[KnowledgeGraphNode]
    edges: list[KnowledgeGraphEdge]
