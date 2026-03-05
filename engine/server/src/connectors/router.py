"""
Connector router.

API endpoints for connector CRUD operations.
"""

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from src.auth import CurrentUser, RequireAdmin
from src.connectors.schemas import (
    ConnectorCreate,
    ConnectorCreateResponse,
    ConnectorListResponse,
    ConnectorResponse,
    ConnectorUpdate,
)
from src.domain_config import get_config_provider
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .models import Connector

logger = logging.getLogger(__name__)


async def _verify_agent_exists(agent_id: str) -> None:
    """Verify agent_id exists in config. Raises 404 if not found."""
    config_provider = get_config_provider()
    agent = await config_provider.get_agent_config(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

router = APIRouter(prefix="/connectors", tags=["Connectors"])


def to_response(connector: Connector) -> ConnectorResponse:
    """Convert connector model to response (without secret)."""
    return ConnectorResponse(
        id=connector.id,
        name=connector.name,
        connector_type=connector.connector_type,
        agent_id=connector.agent_id,
        webhook_url=f"/webhooks/{connector.id}",
        is_enabled=connector.is_enabled,
        config=connector.config or {},
        created_at=connector.created_at.isoformat(),
        updated_at=connector.updated_at.isoformat(),
    )


def to_create_response(connector: Connector) -> ConnectorCreateResponse:
    """Convert connector model to creation response (includes secret once)."""
    return ConnectorCreateResponse(
        id=connector.id,
        name=connector.name,
        connector_type=connector.connector_type,
        agent_id=connector.agent_id,
        webhook_secret=connector.webhook_secret,
        webhook_url=f"/webhooks/{connector.id}",
        is_enabled=connector.is_enabled,
        config=connector.config or {},
        created_at=connector.created_at.isoformat(),
        updated_at=connector.updated_at.isoformat(),
    )


# ─── Config validation ────────────────────────────────────────────────────────

# Allowed config keys per connector type (reject unexpected keys)
_ALLOWED_CONFIG_KEYS: dict[str, frozenset[str]] = {
    "slack": frozenset({"channel", "signing_secret", "bot_token", "app_token"}),
    "teams": frozenset({"tenant_id", "app_id", "app_secret", "channel"}),
    "email": frozenset({"smtp_host", "smtp_port", "imap_host", "address", "use_tls"}),
    "discord": frozenset({"bot_token", "application_id", "public_key", "guild_id", "channel_id"}),
}


def validate_connector_config(connector_type: str, config: dict) -> None:
    """Validate config keys against the connector type whitelist."""
    allowed = _ALLOWED_CONFIG_KEYS.get(connector_type)
    if allowed is None:
        return  # Unknown type already blocked by schema regex
    unexpected = set(config.keys()) - allowed
    if unexpected:
        raise HTTPException(
            status_code=422,
            detail=f"Unexpected config keys for {connector_type}: {sorted(unexpected)}",
        )


# ─── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=ConnectorListResponse, dependencies=[RequireAdmin])
async def list_connectors(
    user: CurrentUser,
    db: DbSession,
) -> ConnectorListResponse:
    """List all connectors."""
    result = await db.execute(
        select(Connector).order_by(Connector.created_at.desc())
    )
    connectors = list(result.scalars().all())

    return ConnectorListResponse(
        items=[to_response(c) for c in connectors],
        total=len(connectors),
    )


@router.post("", response_model=ConnectorCreateResponse, status_code=201, dependencies=[RequireAdmin])
async def create_connector(
    data: ConnectorCreate,
    user: CurrentUser,
    db: DbSession,
) -> ConnectorCreateResponse:
    """Create a new connector.

    Returns the webhook_secret once in the response. It will not be
    included in subsequent GET/PUT/LIST responses.
    """
    validate_connector_config(data.connector_type, data.config)
    await _verify_agent_exists(data.agent_id)

    connector = Connector(
        id=str(uuid4()),
        name=data.name,
        connector_type=data.connector_type,
        agent_id=data.agent_id,
        config=data.config,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)

    return to_create_response(connector)


@router.get("/{connector_id}", response_model=ConnectorResponse, dependencies=[RequireAdmin])
async def get_connector(
    connector_id: str,
    user: CurrentUser,
    db: DbSession,
) -> ConnectorResponse:
    """Get a specific connector."""
    result = await db.execute(
        select(Connector).where(Connector.id == connector_id)
    )
    connector = result.scalar_one_or_none()

    if not connector:
        raise_not_found("Connector")

    return to_response(connector)


@router.put("/{connector_id}", response_model=ConnectorResponse, dependencies=[RequireAdmin])
async def update_connector(
    connector_id: str,
    data: ConnectorUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ConnectorResponse:
    """Update a connector."""
    result = await db.execute(
        select(Connector).where(Connector.id == connector_id)
    )
    connector = result.scalar_one_or_none()

    if not connector:
        raise_not_found("Connector")

    if data.name is not None:
        connector.name = data.name
    if data.agent_id is not None:
        await _verify_agent_exists(data.agent_id)
        connector.agent_id = data.agent_id
    if data.is_enabled is not None:
        connector.is_enabled = data.is_enabled
    if data.config is not None:
        validate_connector_config(connector.connector_type, data.config)
        connector.config = data.config

    await db.commit()
    await db.refresh(connector)

    return to_response(connector)


@router.delete("/{connector_id}", status_code=204, dependencies=[RequireAdmin])
async def delete_connector(
    connector_id: str,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a connector."""
    result = await db.execute(
        select(Connector).where(Connector.id == connector_id)
    )
    connector = result.scalar_one_or_none()

    if not connector:
        raise_not_found("Connector")

    await db.delete(connector)
    await db.commit()
