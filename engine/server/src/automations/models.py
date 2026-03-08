"""SQLAlchemy model for automation run history."""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base
from src.infra.utils import utcnow


class AutomationRunStatus(enum.StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class AutomationRun(Base):
    __tablename__ = "automation_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    automation_id: Mapped[str] = mapped_column(String(36), index=True)
    status: Mapped[AutomationRunStatus] = mapped_column(
        Enum(AutomationRunStatus),
        default=AutomationRunStatus.PENDING,
    )
    source_type: Mapped[str] = mapped_column(String(50), default="")
    source_ref: Mapped[str] = mapped_column(String(255), default="")  # e.g. "owner/repo#42"
    execution_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    result_summary: Mapped[str] = mapped_column(Text, default="")
    error_message: Mapped[str] = mapped_column(Text, default="")
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
