"""Admin user service helpers.

Shared query helpers for admin user management.
"""

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.executions.models import ExecutionRun, ExecutionStatus
from src.infra.token_pricing import estimate_cost
from src.infra.utils import utcnow


async def compute_user_cost(db: AsyncSession, user_id: str) -> float | None:
    """Sum estimated cost across all completed executions for a user."""
    result = await db.execute(
        select(
            ExecutionRun.model,
            ExecutionRun.tokens_prompt,
            ExecutionRun.tokens_completion,
        )
        .where(
            ExecutionRun.user_id == user_id,
            ExecutionRun.status == ExecutionStatus.COMPLETED,
            ExecutionRun.model.isnot(None),
        )
    )
    total = 0.0
    has_cloud = False
    for model_id, prompt_tokens, completion_tokens in result:
        cost = estimate_cost(model_id, prompt_tokens, completion_tokens)
        if cost is not None:
            total += cost
            has_cloud = True
    return total if has_cloud else None


async def get_user_or_404(db: AsyncSession, user_id: str) -> User:
    """Fetch user by ID or raise 404."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_range_start(range_param: str) -> datetime | None:
    """Convert range string to start datetime."""
    now = utcnow()
    if range_param == "24h":
        return now - timedelta(hours=24)
    elif range_param == "7d":
        return now - timedelta(days=7)
    elif range_param == "30d":
        return now - timedelta(days=30)
    return None  # "all"
