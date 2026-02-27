"""
Versioned configuration DB models.

Stores agent and graph configurations with full version history.
Each save creates a new version row with auto-incremented version number.
Only one version per agent/graph can be active at a time (enforced by partial unique index).
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base


class AgentConfigVersion(Base):
    """Versioned agent configuration.

    Composite PK (id, version) allows multiple versions per agent.
    Partial unique index ensures exactly one active version per agent.
    """

    __tablename__ = "agent_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36), nullable=True
    )  # NO FK — informational only
    change_note: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    __table_args__ = (
        # Ensure exactly one active version per agent
        Index(
            "ix_agent_configs_active",
            "id",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
        # Fast "latest version" lookups
        Index("ix_agent_configs_id_version_desc", "id", version.desc()),
        # Fast time-based queries
        Index("ix_agent_configs_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<AgentConfigVersion id={self.id} v{self.version} active={self.is_active}>"


class GraphConfigVersion(Base):
    """Versioned graph configuration.

    Same structure as AgentConfigVersion for consistency.
    """

    __tablename__ = "graph_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36), nullable=True
    )
    change_note: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    __table_args__ = (
        Index(
            "ix_graph_configs_active",
            "id",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
        Index("ix_graph_configs_id_version_desc", "id", version.desc()),
        Index("ix_graph_configs_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<GraphConfigVersion id={self.id} v{self.version} active={self.is_active}>"
