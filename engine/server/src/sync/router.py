"""Sync router — webhook endpoint for platform notifications."""

import logging

from fastapi import APIRouter, HTTPException

from src.infra.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])


@router.post("/trigger")
async def trigger_sync() -> dict:
    """Webhook endpoint — Platform notifies Engine of new config.

    This triggers an immediate poll instead of waiting for the next
    scheduled interval.
    """
    if not settings.PLATFORM_URL:
        raise HTTPException(status_code=400, detail="Platform sync not configured")

    from src.sync.service import SyncService

    svc = SyncService()
    await svc.initialize()
    try:
        updated = await svc.poll()
        return {"updated": updated}
    except Exception:
        logger.exception("Sync trigger failed")
        raise HTTPException(status_code=500, detail="Sync failed")
    finally:
        await svc.close()
