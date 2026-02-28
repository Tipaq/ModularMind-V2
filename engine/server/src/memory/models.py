"""
Memory models.

SQLAlchemy models for agent memory storage.
"""

from datetime import UTC, datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base


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

    content: Mapped[str] = mapped_column(Text)

    importance: Mapped[float] = mapped_column(default=0.5)
    access_count: Mapped[int] = mapped_column(default=0)
    last_accessed: Mapped[datetime | None] = mapped_column(nullable=True)

    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC).replace(tzinfo=None))

    __table_args__ = (
        Index("ix_memory_scope_tier", "scope", "scope_id", "tier"),
    )

    def __repr__(self) -> str:
        return f"<MemoryEntry {self.id[:8]} ({self.scope.value}/{self.tier.value})>"
