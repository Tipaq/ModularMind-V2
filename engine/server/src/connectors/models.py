"""Connector models — webhook-based integrations with execution mode support."""

from datetime import datetime
from secrets import token_urlsafe
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base
from src.infra.utils import utcnow


class Connector(Base):
    """Connector model for webhook-based integrations.

    Scope is derived from user_id/project_id:
    - user_id set → user-scoped (only this user sees it)
    - project_id set → project-scoped (project members see it)
    - Both null → global (all users, admin-only to create)
    """

    __tablename__ = "connectors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200))
    connector_type: Mapped[str] = mapped_column(String(60))

    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    graph_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    supervisor_mode: Mapped[bool] = mapped_column(default=False)

    webhook_secret: Mapped[str] = mapped_column(String(64), default=lambda: token_urlsafe(32))
    is_enabled: Mapped[bool] = mapped_column(default=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)

    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, default=None
    )
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, default=None
    )
    spec: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("ix_connectors_user_id", "user_id"),
        Index("ix_connectors_project_id", "project_id"),
    )

    @property
    def scope(self) -> str:
        if self.user_id:
            return "user"
        if self.project_id:
            return "project"
        return "global"

    def __repr__(self) -> str:
        return f"<Connector {self.name} ({self.connector_type}) scope={self.scope}>"


class ConnectorCredential(Base):
    """Encrypted credential for a connector.

    A connector can have multiple credentials:
    - Shared service credential (user_id=null): e.g., Slack bot token
    - Per-user credential (user_id set): e.g., user's personal X/Twitter token

    Encrypted values stored in DB columns using secrets_store.encrypt_value().
    """

    __tablename__ = "connector_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    connector_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, default=None
    )
    credential_type: Mapped[str] = mapped_column(String(30), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    scopes: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=None)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    is_valid: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_connector_credentials_connector_id", "connector_id"),
        Index("ix_connector_credentials_user_id", "user_id"),
    )

    def __repr__(self) -> str:
        scope = "shared" if self.user_id is None else f"user:{self.user_id[:8]}"
        return f"<ConnectorCredential {self.label} ({self.credential_type}) {scope}>"
