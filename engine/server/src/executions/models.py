"""
Execution models.

SQLAlchemy models for execution tracking.
"""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infra.database import Base


class ExecutionStatus(str, Enum):
    """Execution status enumeration."""

    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class ExecutionType(str, Enum):
    """Execution type enumeration."""

    AGENT = "agent"
    GRAPH = "graph"
    SUPERVISOR = "supervisor"


class ExecutionRun(Base):
    """Execution run model."""

    __tablename__ = "execution_runs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    execution_type: Mapped[ExecutionType] = mapped_column(
        SQLEnum(ExecutionType, values_callable=lambda x: [e.value for e in x])
    )
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    graph_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("conversations.id"), nullable=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )

    status: Mapped[ExecutionStatus] = mapped_column(
        SQLEnum(ExecutionStatus, values_callable=lambda x: [e.value for e in x]),
        default=ExecutionStatus.PENDING
    )
    config_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    config_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stream_task_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )

    input_prompt: Mapped[str] = mapped_column(Text)
    input_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    output_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    tokens_prompt: Mapped[int] = mapped_column(default=0)
    tokens_completion: Mapped[int] = mapped_column(default=0)

    model: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # A/B testing fields
    experiment_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    experiment_variant: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Approval fields
    approval_node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    approval_timeout_at: Mapped[datetime | None] = mapped_column(nullable=True)
    approval_webhook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    approval_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    approval_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    steps: Mapped[list["ExecutionStep"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_execution_approval_status", "status"),
        Index("ix_execution_runs_experiment", "experiment_id", "experiment_variant"),
    )

    def __repr__(self) -> str:
        return f"<ExecutionRun {self.id[:8]} ({self.status.value})>"


class ExecutionStep(Base):
    """Execution step model."""

    __tablename__ = "execution_steps"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("execution_runs.id"), index=True
    )
    step_number: Mapped[int] = mapped_column()

    node_id: Mapped[str] = mapped_column(String(100))
    node_type: Mapped[str] = mapped_column(String(50))

    parent_step_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("execution_steps.id"), nullable=True
    )

    status: Mapped[ExecutionStatus] = mapped_column(
        SQLEnum(ExecutionStatus, values_callable=lambda x: [e.value for e in x]),
        default=ExecutionStatus.PENDING
    )
    input_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    output_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    tokens_prompt: Mapped[int] = mapped_column(default=0)
    tokens_completion: Mapped[int] = mapped_column(default=0)

    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(nullable=True)

    # Relationships
    run: Mapped["ExecutionRun"] = relationship(back_populates="steps")
    parent_step: Mapped["ExecutionStep | None"] = relationship(
        back_populates="sub_steps", remote_side="ExecutionStep.id",
    )
    sub_steps: Mapped[list["ExecutionStep"]] = relationship(
        back_populates="parent_step",
    )

    __table_args__ = (Index("ix_step_run_number", "run_id", "step_number"),)

    def __repr__(self) -> str:
        return f"<ExecutionStep {self.node_id} ({self.status.value})>"
