"""
Memory models.

SQLAlchemy models for agent memory storage.
"""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base
from src.infra.utils import utcnow


class MemoryScope(str, Enum):
    """Memory scope enumeration."""

    AGENT = "agent"
    USER_PROFILE = "user_profile"
    CONVERSATION = "conversation"
    CROSS_CONVERSATION = "cross_conversation"


class MemoryTier(str, Enum):
    """Memory tier enumeration."""

    BUFFER = "buffer"
    SUMMARY = "summary"
    VECTOR = "vector"
    ARCHIVE = "archive"


class MemoryType(str, Enum):
    """Memory type classification."""

    EPISODIC = "episodic"
    SEMANTIC = "semantic"
    PROCEDURAL = "procedural"


class EdgeType(str, Enum):
    """Graph edge type enumeration."""

    ENTITY_OVERLAP = "entity_overlap"
    SAME_CATEGORY = "same_category"
    SEMANTIC_SIMILARITY = "semantic_similarity"
    SAME_TAG = "same_tag"


class MemoryEntry(Base):
    """Memory entry model (vectors stored in Qdrant)."""

    __tablename__ = "memory_entries"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    scope: Mapped[MemoryScope] = mapped_column(SQLEnum(MemoryScope))
    scope_id: Mapped[str] = mapped_column(String(36), index=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    tier: Mapped[MemoryTier] = mapped_column(
        SQLEnum(MemoryTier), default=MemoryTier.BUFFER
    )
    memory_type: Mapped[MemoryType] = mapped_column(
        SQLEnum(MemoryType), default=MemoryType.EPISODIC, index=True
    )

    content: Mapped[str] = mapped_column(Text)

    importance: Mapped[float] = mapped_column(default=0.5)
    access_count: Mapped[int] = mapped_column(default=0)
    last_accessed: Mapped[datetime | None] = mapped_column(nullable=True)
    last_scored_at: Mapped[datetime | None] = mapped_column(nullable=True)
    expired_at: Mapped[datetime | None] = mapped_column(nullable=True)

    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow
    )

    __table_args__ = (
        Index("ix_memory_scope_tier", "scope", "scope_id", "tier"),
    )

    def __repr__(self) -> str:
        return (
            f"<MemoryEntry {self.id[:8]} "
            f"({self.scope.value}/{self.tier.value}/{self.memory_type.value})>"
        )


class ConsolidationLog(Base):
    """Audit log for memory consolidation actions."""

    __tablename__ = "memory_consolidation_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    scope: Mapped[str] = mapped_column(String(30))
    scope_id: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(30))
    source_entry_ids: Mapped[list] = mapped_column(JSONB, default=list)
    result_entry_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow,
        index=True,
    )


class MemoryEdge(Base):
    """Graph edge between two memory entries."""

    __tablename__ = "memory_edges"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    source_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("memory_entries.id"), index=True
    )
    target_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("memory_entries.id"), index=True
    )
    edge_type: Mapped[EdgeType] = mapped_column(SQLEnum(EdgeType))
    weight: Mapped[float] = mapped_column(default=0.5)
    shared_entities: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow
    )

    __table_args__ = (
        Index("uq_memory_edges_src_tgt", "source_id", "target_id", unique=True),
    )
