"""Connector models — webhook-based integrations with execution mode support."""

from datetime import datetime
from enum import StrEnum
from secrets import token_urlsafe
from uuid import uuid4

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base
from src.infra.utils import utcnow


class ConnectorType(StrEnum):
    """Connector type enumeration."""

    SLACK = "slack"
    TEAMS = "teams"
    EMAIL = "email"
    DISCORD = "discord"
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"


class Connector(Base):
    """Connector model for webhook-based integrations."""

    __tablename__ = "connectors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200))
    connector_type: Mapped[str] = mapped_column(String(20))

    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    graph_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    supervisor_mode: Mapped[bool] = mapped_column(default=False)

    webhook_secret: Mapped[str] = mapped_column(String(64), default=lambda: token_urlsafe(32))
    is_enabled: Mapped[bool] = mapped_column(default=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    def __repr__(self) -> str:
        return f"<Connector {self.name} ({self.connector_type})>"
