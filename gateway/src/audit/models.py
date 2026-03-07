"""Gateway audit log model.

Records every tool execution request for compliance and debugging.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base


class GatewayAuditLog(Base):
    """Audit log for all gateway tool execution requests."""

    __tablename__ = "gateway_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)

    category: Mapped[str] = mapped_column(String(20), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    args_json: Mapped[str] = mapped_column(Text, nullable=False)

    decision: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # auto_approved, auto_denied, approved, rejected, timeout
    result_preview: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # success, error, denied, timeout
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_gw_audit_agent_created", "agent_id", "created_at"),
        Index("ix_gw_audit_created", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<GatewayAuditLog id={self.id} agent={self.agent_id} "
            f"{self.tool_name} decision={self.decision}>"
        )
