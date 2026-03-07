"""Gateway approval database models.

Stores pre-approval rules and pending approval requests.
Uses atomic UPDATE WHERE for race-condition-free approval decisions.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base


class GatewayApprovalRule(Base):
    """Pre-approval rules that auto-approve matching requests.

    Rules can be created manually (admin) or via "Approve & Remember".
    Rules created via "Approve & Remember" must have agent_id (NOT NULL).
    """

    __tablename__ = "gateway_approval_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False)  # filesystem, shell, etc.
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # read, write, execute, etc.
    pattern: Mapped[str] = mapped_column(String(500), nullable=False)  # glob pattern
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    match_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_gw_rules_agent_category", "agent_id", "category"),
        Index("ix_gw_rules_active", "is_active", postgresql_where="is_active = true"),
    )

    def __repr__(self) -> str:
        return (
            f"<GatewayApprovalRule id={self.id} agent={self.agent_id} "
            f"{self.category}/{self.action} pattern={self.pattern!r}>"
        )


class GatewayPendingApproval(Base):
    """Pending approval requests awaiting admin decision.

    Decisions are made atomically via UPDATE WHERE status='pending'.
    Only one decision can succeed per request (no race conditions).
    """

    __tablename__ = "gateway_pending_approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    execution_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)

    category: Mapped[str] = mapped_column(String(20), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    args_json: Mapped[str] = mapped_column(Text, nullable=False)
    args_preview: Mapped[str] = mapped_column(String(500), nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )  # pending, approved, rejected, timeout
    decision_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    decision_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    remember: Mapped[bool] = mapped_column(Boolean, default=False)
    remember_pattern: Mapped[str | None] = mapped_column(String(500), nullable=True)

    timeout_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    timeout_action: Mapped[str] = mapped_column(
        String(10), default="deny", nullable=False
    )  # deny or approve

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_gw_pending_status_timeout", "status", "timeout_at"),
        Index("ix_gw_pending_agent_status", "agent_id", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<GatewayPendingApproval id={self.id} agent={self.agent_id} "
            f"{self.category}/{self.action} status={self.status}>"
        )
