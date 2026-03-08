"""Recall test run database model for storing historical results."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base


class RecallTestRun(Base):
    """Historical recall test run result."""

    __tablename__ = "recall_test_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    suite_name: Mapped[str] = mapped_column(String(200), nullable=False)
    collection_id: Mapped[str] = mapped_column(String(36), nullable=False)
    avg_recall_at_k: Mapped[float] = mapped_column(Float, nullable=False)
    avg_mrr: Mapped[float] = mapped_column(Float, nullable=False)
    avg_ndcg: Mapped[float] = mapped_column(Float, nullable=False)
    avg_latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    results_detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_recall_test_runs_suite_name", "suite_name"),
        Index("ix_recall_test_runs_created_at", "created_at"),
    )
