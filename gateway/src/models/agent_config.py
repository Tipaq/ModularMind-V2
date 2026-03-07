"""Read-only mirror of engine's AgentConfigVersion model.

This is a read-only model that mirrors the engine's agent_configs table.
The Gateway uses this to load permissions independently from the shared PostgreSQL.

IMPORTANT: This model must stay in sync with engine/server/src/domain_config/models.py.
Do NOT add relationships or modify the table through this model.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base


class AgentConfigMirror(Base):
    """Read-only mirror of engine's agent_configs table.

    Composite PK (id, version). Only query WHERE is_active=true for current config.
    """

    __tablename__ = "agent_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    change_note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # NOTE: No __table_args__ — indexes are managed by the engine's Alembic.
    # This model is read-only and must NOT create or modify any tables.

    def __repr__(self) -> str:
        return f"<AgentConfigMirror id={self.id} v{self.version} active={self.is_active}>"
