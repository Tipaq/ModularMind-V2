"""Sync router — webhook endpoint for platform notifications."""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from src.infra.config import settings
from src.infra.rate_limit import RateLimitDependency
from src.internal.auth import verify_internal_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])

_sync_rate_limit = RateLimitDependency(requests_per_minute=10)


@router.post("/trigger", dependencies=[Depends(_sync_rate_limit)])
async def trigger_sync(request: Request) -> dict[str, bool]:
    """Webhook endpoint — Platform notifies Engine of new config.

    This triggers an immediate poll instead of waiting for the next
    scheduled interval. Protected by HMAC-derived internal token.
    """
    verify_internal_token(request)

    if not settings.PLATFORM_URL:
        raise HTTPException(status_code=400, detail="Platform sync not configured")

    from src.sync.service import SyncService

    svc = SyncService()
    await svc.initialize()
    try:
        updated = await svc.poll()
        return {"updated": updated}
    except (httpx.HTTPError, ConnectionError, OSError, ValueError) as exc:
        logger.exception("Sync trigger failed")
        raise HTTPException(status_code=500, detail="Sync failed") from exc
    finally:
        await svc.close()
