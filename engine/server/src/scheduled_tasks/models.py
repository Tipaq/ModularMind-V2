"""SQLAlchemy models for scheduled tasks and their run history."""

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base
from src.infra.utils import utcnow


class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Scheduling
    schedule_type: Mapped[str] = mapped_column(
        String(20),
        default="manual",
    )  # "interval" | "one_shot" | "manual"
    interval_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interval_unit: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )  # "minutes" | "hours" | "days"
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    start_at: Mapped[str | None] = mapped_column(
        String(5),
        nullable=True,
    )  # Anchor time for intervals, e.g. "09:00" or "00:30"
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Execution target
    target_type: Mapped[str] = mapped_column(String(20), default="agent")
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    input_text: Mapped[str] = mapped_column(Text, default="")

    # Extra config (source handlers, post-actions, triage, settings)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utcnow,
        onupdate=utcnow,
    )


class ScheduledTaskRunStatus(enum.StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ScheduledTaskRun(Base):
    __tablename__ = "scheduled_task_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scheduled_task_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("scheduled_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[ScheduledTaskRunStatus] = mapped_column(
        Enum(ScheduledTaskRunStatus, values_callable=lambda e: [m.value for m in e]),
        default=ScheduledTaskRunStatus.PENDING,
    )
    source_type: Mapped[str] = mapped_column(String(50), default="")
    source_ref: Mapped[str] = mapped_column(String(255), default="")
    execution_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    result_summary: Mapped[str] = mapped_column(Text, default="")
    error_message: Mapped[str] = mapped_column(Text, default="")
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
