"""
Internal alert/threshold endpoints.

CRUD for alert threshold configuration and alert history.
"""

import json
import logging

from fastapi import APIRouter, HTTPException, status

from src.auth import CurrentUser, RequireAdmin
from src.internal.schemas import (
    ActiveAlertsResponse,
    AlertHistoryResponse,
    AlertItem,
    ThresholdConfig,
    ThresholdUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Internal"])


@router.get("/alerts/thresholds", dependencies=[RequireAdmin])
async def get_alert_thresholds(user: CurrentUser) -> ThresholdConfig:
    """Get current alert threshold configuration."""
    from src.infra.metrics import get_thresholds

    data = await get_thresholds()
    return ThresholdConfig(**data)


@router.put("/alerts/thresholds", dependencies=[RequireAdmin])
async def update_alert_thresholds(body: ThresholdUpdate, user: CurrentUser) -> ThresholdConfig:
    """Update alert threshold configuration (partial update)."""
    from src.infra.metrics import ALERT_THRESHOLDS_KEY, get_thresholds
    from src.infra.redis import get_redis_client

    current = await get_thresholds()

    # Apply partial updates
    updates = body.model_dump(exclude_none=True)
    current.update(updates)

    r = await get_redis_client()
    if not r:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis unavailable",
        )
    try:
        await r.set(ALERT_THRESHOLDS_KEY, json.dumps(current))
    finally:
        await r.aclose()

    return ThresholdConfig(**current)


@router.get("/alerts/history", dependencies=[RequireAdmin])
async def get_alert_history(user: CurrentUser) -> AlertHistoryResponse:
    """Get recent alert history (last 100)."""
    from src.infra.metrics import ALERT_HISTORY_KEY
    from src.infra.redis import get_redis_client

    r = await get_redis_client()
    if not r:
        return AlertHistoryResponse(items=[], total=0)

    try:
        raw_items = await r.lrange(ALERT_HISTORY_KEY, 0, -1)
        items: list[AlertItem] = []
        for raw in raw_items:
            try:
                items.append(AlertItem(**json.loads(raw)))
            except Exception:
                continue
        return AlertHistoryResponse(items=items, total=len(items))
    finally:
        await r.aclose()


@router.get("/alerts/active", dependencies=[RequireAdmin])
async def get_active_alerts(user: CurrentUser) -> ActiveAlertsResponse:
    """Get currently active alerts (those within cooldown window)."""
    from src.infra.metrics import ALERT_HISTORY_KEY
    from src.infra.redis import get_redis_client

    r = await get_redis_client()
    if not r:
        return ActiveAlertsResponse(active_count=0, alerts=[])

    try:
        keys = [k async for k in r.scan_iter(match="monitoring:alert_active:*", count=100)]
        active_count = len(keys)

        alerts: list[AlertItem] = []
        if active_count > 0:
            raw_items = await r.lrange(ALERT_HISTORY_KEY, -active_count, -1)
            for raw in raw_items:
                try:
                    alerts.append(AlertItem(**json.loads(raw)))
                except Exception:
                    continue

        return ActiveAlertsResponse(active_count=active_count, alerts=alerts)
    finally:
        await r.aclose()
