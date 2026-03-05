"""
Conversation models.

SQLAlchemy models for conversation tracking.
"""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from src.infra.utils import utcnow

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infra.database import Base


class MessageRole(str, Enum):
    """Message role enumeration."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class Conversation(Base):
    """Conversation model."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)

    is_active: Mapped[bool] = mapped_column(default=True)
    supervisor_mode: Mapped[bool] = mapped_column(default=False)
    config: Mapped[dict[str, Any]] = mapped_column("config", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=utcnow, onupdate=utcnow
    )
    last_memory_extracted_at: Mapped[datetime | None] = mapped_column(
        nullable=True, default=None
    )

    # Relationships
    messages: Mapped[list["ConversationMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ConversationMessage.created_at",
    )

    def __repr__(self) -> str:
        ref = self.agent_id[:8] if self.agent_id else "none"
        return f"<Conversation {self.id[:8]} ({ref})>"


class ConversationMessage(Base):
    """Conversation message model."""

    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id"), index=True
    )
    execution_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("execution_runs.id"), nullable=True
    )

    role: Mapped[MessageRole] = mapped_column(
        SQLEnum(MessageRole, values_callable=lambda e: [m.value for m in e])
    )
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    attachments: Mapped[list[dict]] = mapped_column(JSONB, default=list, server_default="[]")

    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    # Relationship
    conversation: Mapped["Conversation"] = relationship(back_populates="messages")

    __table_args__ = (
        Index("ix_message_conversation_time", "conversation_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Message {self.role.value}: {self.content[:30]}...>"
