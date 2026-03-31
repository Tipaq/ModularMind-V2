"""SQLAlchemy models for the System Indexer."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Float, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base
from src.infra.utils import utcnow


class IndexedSystem(Base):
    """A registered external system that has been structurally indexed."""

    __tablename__ = "indexed_systems"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    system_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # erp, api, database
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    mcp_server_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    unit_count: Mapped[int] = mapped_column(default=0)
    relationship_count: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, indexing, ready, failed, stale
    last_indexed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    credential_ref: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class SystemRelationship(Base):
    """Directed edge between two StructuralUnits stored in Qdrant."""

    __tablename__ = "system_relationships"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    system_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    target_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    metadata: Mapped[dict] = mapped_column(JSONB, default=dict)

    __table_args__ = (
        Index("ix_sysrel_system_source", "system_id", "source_unit_id"),
        Index("ix_sysrel_system_target", "system_id", "target_unit_id"),
    )
