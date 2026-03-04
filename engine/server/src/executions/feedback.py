"""Execution feedback system.

Stores user ratings and corrections for agent responses.
Corrections can be injected as few-shot examples in future executions.
"""

import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from src.infra.utils import utcnow

from pydantic import BaseModel, Field
from sqlalchemy import Index, String, Text, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base

logger = logging.getLogger(__name__)


class ExecutionFeedback(Base):
    """Feedback for an execution step or run."""

    __tablename__ = "execution_feedback"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    execution_id: Mapped[str] = mapped_column(String(36), index=True)
    step_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    agent_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True,
    )
    user_id: Mapped[str] = mapped_column(String(36), index=True)

    rating: Mapped[int] = mapped_column()  # 1-5
    correction: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    __table_args__ = (
        Index("ix_feedback_agent_rating", "agent_id", "rating"),
    )

    def __repr__(self) -> str:
        return f"<ExecutionFeedback {self.id[:8]} rating={self.rating}>"


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class FeedbackCreate(BaseModel):
    """Create feedback request."""

    rating: int = Field(ge=1, le=5)
    correction: str | None = None
    original_response: str | None = None
    step_id: str | None = None
    agent_id: str | None = None
    tags: list[str] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    """Feedback response."""

    id: str
    execution_id: str
    step_id: str | None
    agent_id: str | None
    user_id: str
    rating: int
    correction: str | None
    tags: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class FeedbackService:
    """Feedback CRUD and few-shot correction retrieval."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_feedback(
        self,
        execution_id: str,
        user_id: str,
        data: FeedbackCreate,
    ) -> ExecutionFeedback:
        """Store feedback for an execution."""
        feedback = ExecutionFeedback(
            execution_id=execution_id,
            step_id=data.step_id,
            agent_id=data.agent_id,
            user_id=user_id,
            rating=data.rating,
            correction=data.correction,
            original_response=data.original_response,
            tags=data.tags,
        )
        self.db.add(feedback)
        await self.db.commit()
        await self.db.refresh(feedback)

        logger.info(
            "Feedback created: execution=%s, rating=%d, has_correction=%s",
            execution_id, data.rating, data.correction is not None,
        )
        return feedback

    async def get_feedback(
        self, execution_id: str,
    ) -> list[ExecutionFeedback]:
        """Get all feedback for an execution."""
        stmt = (
            select(ExecutionFeedback)
            .where(ExecutionFeedback.execution_id == execution_id)
            .order_by(ExecutionFeedback.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_agent_corrections(
        self, agent_id: str, limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Get recent corrections for an agent — used for few-shot injection.

        Returns list of {original, correction, rating} pairs ordered by
        recency. Only includes feedback with corrections (not just ratings).
        """
        stmt = (
            select(ExecutionFeedback)
            .where(
                ExecutionFeedback.agent_id == agent_id,
                ExecutionFeedback.correction.isnot(None),
                ExecutionFeedback.correction != "",
            )
            .order_by(ExecutionFeedback.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        feedbacks = result.scalars().all()

        return [
            {
                "original": fb.original_response or "(no original)",
                "correction": fb.correction,
                "rating": fb.rating,
            }
            for fb in feedbacks
        ]
