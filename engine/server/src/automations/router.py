"""Engine-side automation API routes.

These are called by Platform proxy routes:
- POST /api/v1/automations/{id}/trigger — manual trigger
- GET /api/v1/automations/{id}/runs — run history
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user
from src.infra.database import get_db as get_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/automations", tags=["automations"])


@router.post("/{automation_id}/trigger")
async def trigger_automation(
    automation_id: str,
    user=Depends(get_current_user),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
):
    """Manually trigger an automation to run now."""
    import redis.asyncio as aioredis

    from src.infra.config import get_settings

    settings = get_settings()
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = await r.get(f"automation:config:{automation_id}")
        if not raw:
            raise HTTPException(404, f"Automation {automation_id} not found")

        config_data = json.loads(raw)
        if not config_data.get("enabled"):
            raise HTTPException(400, "Automation is disabled")

        # Publish trigger event on Redis stream
        await r.xadd(
            "tasks:automation_trigger",
            {"automation_id": automation_id, "triggered_by": user.id},
        )

        return {"status": "triggered", "automation_id": automation_id}
    finally:
        await r.aclose()


@router.get("/{automation_id}/runs")
async def get_automation_runs(
    automation_id: str,
    limit: int = 20,
    offset: int = 0,
    user=Depends(get_current_user),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
):
    """Get run history for an automation."""
    from src.automations.models import AutomationRun

    result = await session.execute(
        select(AutomationRun)
        .where(AutomationRun.automation_id == automation_id)
        .order_by(AutomationRun.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))
    )
    runs = result.scalars().all()

    return {
        "items": [
            {
                "id": r.id,
                "automation_id": r.automation_id,
                "status": r.status.value,
                "source_type": r.source_type,
                "source_ref": r.source_ref,
                "execution_id": r.execution_id,
                "result_summary": r.result_summary,
                "error_message": r.error_message,
                "duration_seconds": r.duration_seconds,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in runs
        ],
        "total": len(runs),
    }
