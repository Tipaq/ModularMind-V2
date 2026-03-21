"""Generic webhook receiver — delegates to platform adapters."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select

from src.connectors.adapters.whatsapp import WhatsAppAdapter
from src.connectors.execution import execute_and_collect, launch_background_execution
from src.connectors.models import Connector
from src.connectors.registry import get_adapter
from src.infra.constants import RATE_LIMIT_WEBHOOK
from src.infra.database import DbSession
from src.infra.rate_limit import RateLimitDependency

logger = logging.getLogger(__name__)

webhook_router = APIRouter(tags=["Webhooks"])
_webhook_rate_limit = RateLimitDependency(requests_per_minute=RATE_LIMIT_WEBHOOK)


async def _load_connector(connector_id: str, db: DbSession) -> Connector:
    """Load connector by ID or raise 404."""
    try:
        UUID(connector_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None

    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="Not found")
    return connector


@webhook_router.get("/{connector_id}")
async def verify_webhook(
    connector_id: str,
    request: Request,
    db: DbSession,
) -> dict:
    """Handle GET-based webhook verification (WhatsApp hub.challenge)."""
    connector = await _load_connector(connector_id, db)
    adapter = get_adapter(connector.connector_type)
    if not adapter:
        raise HTTPException(status_code=400, detail="Unknown connector type")

    if isinstance(adapter, WhatsAppAdapter):
        result = await adapter.handle_get_handshake(request, connector)
        if result.is_handshake and result.response is not None:
            return result.response
    raise HTTPException(status_code=405, detail="Method not allowed")


@webhook_router.post(
    "/{connector_id}",
    dependencies=[Depends(_webhook_rate_limit)],
)
async def receive_webhook(
    connector_id: str,
    request: Request,
    db: DbSession,
) -> dict:
    """Receive and process webhook from external service."""
    connector = await _load_connector(connector_id, db)
    adapter = get_adapter(connector.connector_type)
    if not adapter:
        raise HTTPException(status_code=400, detail="Unknown connector type")

    body = await request.body()
    await adapter.verify_signature(request, body, connector)

    try:
        payload = await request.json()
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from None

    handshake = await adapter.handle_handshake(request, payload, connector)
    if handshake.is_handshake:
        return handshake.response

    if not connector.is_enabled:
        raise HTTPException(status_code=503, detail="Connector is disabled")

    message = adapter.extract_message(payload)
    if not message:
        return {"status": "ignored", "reason": "No message content extracted"}

    if adapter.requires_deferred_execution():
        launch_background_execution(adapter, connector, message)
        return adapter.deferred_ack_response(payload)

    response_text = await execute_and_collect(db, connector, message)
    await adapter.send_response(connector, message.platform_context, response_text)
    return {"status": "ok", "response": response_text}
