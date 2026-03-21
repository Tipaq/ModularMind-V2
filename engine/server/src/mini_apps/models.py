"""SQLAlchemy models for mini-apps."""

from datetime import datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infra.database import Base
from src.infra.utils import utcnow


class MiniAppScope(StrEnum):
    """Mini-app visibility scope."""

    GLOBAL = "GLOBAL"
    GROUP = "GROUP"
    PERSONAL = "PERSONAL"


class MiniApp(Base):
    """Agent-created web application."""

    __tablename__ = "mini_apps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str | None] = mapped_column(String(200), nullable=True)
    entry_file: Mapped[str] = mapped_column(String(200), default="index.html")
    version: Mapped[int] = mapped_column(default=1)
    is_active: Mapped[bool] = mapped_column(default=True)

    scope: Mapped[MiniAppScope] = mapped_column(
        SQLEnum(MiniAppScope, values_callable=lambda x: [e.value for e in x]),
        default=MiniAppScope.PERSONAL,
        nullable=False,
    )
    allowed_groups: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    files: Mapped[list["MiniAppFile"]] = relationship(
        back_populates="app", cascade="all, delete-orphan",
    )
    storage: Mapped[list["MiniAppStorage"]] = relationship(
        back_populates="app", cascade="all, delete-orphan",
    )
    snapshots: Mapped[list["MiniAppSnapshot"]] = relationship(
        back_populates="app", cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("agent_id", "slug", name="uq_mini_apps_agent_slug"),
        Index("ix_mini_apps_scope", "scope"),
        Index("ix_mini_apps_owner", "owner_user_id"),
    )


class MiniAppFile(Base):
    """File stored in a mini-app."""

    __tablename__ = "mini_app_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    app_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("mini_apps.id", ondelete="CASCADE"), nullable=False,
    )
    path: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text, default="")
    size_bytes: Mapped[int] = mapped_column(default=0)
    content_type: Mapped[str] = mapped_column(String(100), default="text/plain")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    app: Mapped["MiniApp"] = relationship(back_populates="files")

    __table_args__ = (
        UniqueConstraint("app_id", "path", name="uq_mini_app_files_app_path"),
    )


class MiniAppStorage(Base):
    """Key-value storage for a mini-app."""

    __tablename__ = "mini_app_storage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    app_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("mini_apps.id", ondelete="CASCADE"), nullable=False,
    )
    key: Mapped[str] = mapped_column(String(256))
    value: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    app: Mapped["MiniApp"] = relationship(back_populates="storage")

    __table_args__ = (
        UniqueConstraint("app_id", "key", name="uq_mini_app_storage_app_key"),
        Index("ix_mini_app_storage_app", "app_id"),
    )


class MiniAppSnapshot(Base):
    """Version snapshot of a mini-app's files."""

    __tablename__ = "mini_app_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    app_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("mini_apps.id", ondelete="CASCADE"), nullable=False,
    )
    version: Mapped[int] = mapped_column()
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    file_manifest: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    app: Mapped["MiniApp"] = relationship(back_populates="snapshots")

    __table_args__ = (
        Index("ix_mini_app_snapshots_app", "app_id"),
    )
