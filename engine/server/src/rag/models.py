"""
RAG models.

SQLAlchemy models for RAG collections.
Supports both synced-from-platform and locally-created collections/documents.
"""

from datetime import datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infra.database import Base
from src.infra.utils import utcnow


class DocumentStatus(StrEnum):
    """Document processing status."""

    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class RAGScope(StrEnum):
    """RAG collection access scope."""

    GLOBAL = "global"  # Everyone can access
    GROUP = "group"  # Only users in allowed_groups
    AGENT = "agent"  # Only the owning agent


class RAGCollection(Base):
    """RAG collection model."""

    __tablename__ = "rag_collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    document_count: Mapped[int] = mapped_column(default=0)
    chunk_count: Mapped[int] = mapped_column(default=0)
    chunk_size: Mapped[int] = mapped_column(default=500)
    chunk_overlap: Mapped[int] = mapped_column(default=50)
    last_sync: Mapped[datetime | None] = mapped_column(nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    # Scoping fields
    scope: Mapped[RAGScope] = mapped_column(
        SQLEnum(RAGScope, values_callable=lambda x: [e.value for e in x]),
        default=RAGScope.GLOBAL,
        nullable=False,
        index=True,
    )
    allowed_groups: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )  # Group slugs, used when scope=GROUP
    owner_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )  # Used when scope=AGENT
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Relationships
    documents: Mapped[list["RAGDocument"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<RAGCollection {self.name} ({self.document_count} docs)>"


class RAGDocument(Base):
    """RAG document model."""

    __tablename__ = "rag_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rag_collections.id"), index=True
    )
    filename: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    chunk_count: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(
        String(20), default=DocumentStatus.PENDING.value, index=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    # Relationships
    collection: Mapped["RAGCollection"] = relationship(back_populates="documents")
    chunks: Mapped[list["RAGChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<RAGDocument {self.filename}>"


class RAGChunk(Base):
    """RAG chunk model (vectors stored in Qdrant)."""

    __tablename__ = "rag_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("rag_documents.id"), index=True)
    collection_id: Mapped[str] = mapped_column(String(36), index=True)
    content: Mapped[str] = mapped_column(Text)
    chunk_index: Mapped[int] = mapped_column()
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    access_count: Mapped[int] = mapped_column(default=0)
    last_accessed: Mapped[datetime | None] = mapped_column(nullable=True)
    embedding_cache: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    # Relationships
    document: Mapped["RAGDocument"] = relationship(back_populates="chunks")

    __table_args__ = (
        Index("ix_chunk_collection", "collection_id"),
        Index("ix_chunk_document_index", "document_id", "chunk_index"),
    )

    def __repr__(self) -> str:
        return f"<RAGChunk {self.document_id[:8]}:{self.chunk_index}>"
