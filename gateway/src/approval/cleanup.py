"""Retention policy — clean up resolved approvals older than RETENTION_DAYS."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import TYPE_CHECKING

from sqlalchemy import delete

from src.approval.models import GatewayPendingApproval
from src.config import get_settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def cleanup_resolved_approvals(db: AsyncSession) -> int:
    """Delete resolved approvals older than RETENTION_DAYS.

    Runs daily via APScheduler.
    """
    from src.infra.database import utcnow

    settings = get_settings()
    cutoff = utcnow() - timedelta(days=settings.APPROVAL_RETENTION_DAYS)

    result = await db.execute(
        delete(GatewayPendingApproval).where(
            GatewayPendingApproval.status.in_(["approved", "rejected", "timeout"]),
            GatewayPendingApproval.created_at < cutoff,
        )
    )
    await db.commit()

    count = result.rowcount
    if count:
        logger.info("Cleaned up %d resolved approvals older than %s", count, cutoff)
    return count
