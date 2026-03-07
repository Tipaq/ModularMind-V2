"""Audit log query service."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import func, select

from src.audit.models import GatewayAuditLog

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class AuditService:
    """Query and filter audit log entries."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def query(
        self,
        *,
        agent_id: str | None = None,
        execution_id: str | None = None,
        category: str | None = None,
        decision: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[GatewayAuditLog], int]:
        """Query audit logs with filters. Returns (entries, total_count)."""
        base = select(GatewayAuditLog)
        count_base = select(func.count()).select_from(GatewayAuditLog)

        conditions = []
        if agent_id:
            conditions.append(GatewayAuditLog.agent_id == agent_id)
        if execution_id:
            conditions.append(GatewayAuditLog.execution_id == execution_id)
        if category:
            conditions.append(GatewayAuditLog.category == category)
        if decision:
            conditions.append(GatewayAuditLog.decision == decision)

        if conditions:
            base = base.where(*conditions)
            count_base = count_base.where(*conditions)

        total = (await self._db.execute(count_base)).scalar_one()

        rows = (
            await self._db.execute(
                base.order_by(GatewayAuditLog.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).scalars().all()

        return rows, total
