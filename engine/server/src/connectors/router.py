"""Connector router — CRUD operations + connector types metadata."""

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from src.auth import CurrentUser, RequireAdmin
from src.connectors.registry import all_connector_types, get_adapter, registered_type_ids
from src.connectors.schemas import (
    ConnectorCreate,
    ConnectorCreateResponse,
    ConnectorFieldDefResponse,
    ConnectorListResponse,
    ConnectorResponse,
    ConnectorTypeResponse,
    ConnectorTypesListResponse,
    ConnectorUpdate,
)
from src.domain_config import get_config_provider
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .models import Connector

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connectors", tags=["Connectors"])

EXECUTION_CONFIG_KEYS = frozenset({"model_id", "enabled_agent_ids", "enabled_graph_ids"})


async def _verify_agent_exists(agent_id: str) -> None:
    config_provider = get_config_provider()
    agent = await config_provider.get_agent_config(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")


async def _verify_graph_exists(graph_id: str) -> None:
    config_provider = get_config_provider()
    graph = await config_provider.get_graph_config(graph_id)
    if not graph:
        raise HTTPException(status_code=404, detail=f"Graph {graph_id} not found")


def _validate_connector_config(connector_type: str, config: dict) -> None:
    adapter = get_adapter(connector_type)
    if not adapter:
        raise HTTPException(status_code=422, detail=f"Unknown connector type: {connector_type}")
    allowed = adapter.allowed_config_keys() | EXECUTION_CONFIG_KEYS
    unexpected = set(config.keys()) - allowed
    if unexpected:
        raise HTTPException(
            status_code=422,
            detail=f"Unexpected config keys for {connector_type}: {sorted(unexpected)}",
        )


def _validate_connector_type(connector_type: str) -> None:
    if connector_type not in registered_type_ids():
        raise HTTPException(status_code=422, detail=f"Unknown connector type: {connector_type}")


def _validate_execution_target(data: ConnectorCreate) -> None:
    has_model = bool((data.config or {}).get("model_id"))
    if not data.agent_id and not data.graph_id and not data.supervisor_mode and not has_model:
        raise HTTPException(
            status_code=422,
            detail="At least one execution target required: "
            "agent_id, graph_id, supervisor_mode, or model_id in config",
        )


async def _verify_execution_target(data: ConnectorCreate) -> None:
    if data.agent_id:
        await _verify_agent_exists(data.agent_id)
    if data.graph_id:
        await _verify_graph_exists(data.graph_id)


def to_response(connector: Connector) -> ConnectorResponse:
    return ConnectorResponse(
        id=connector.id,
        name=connector.name,
        connector_type=connector.connector_type,
        agent_id=connector.agent_id,
        graph_id=connector.graph_id,
        supervisor_mode=connector.supervisor_mode,
        webhook_url=f"/webhooks/{connector.id}",
        is_enabled=connector.is_enabled,
        config=connector.config or {},
        created_at=connector.created_at.isoformat(),
        updated_at=connector.updated_at.isoformat(),
    )


def to_create_response(connector: Connector) -> ConnectorCreateResponse:
    return ConnectorCreateResponse(
        id=connector.id,
        name=connector.name,
        connector_type=connector.connector_type,
        agent_id=connector.agent_id,
        graph_id=connector.graph_id,
        supervisor_mode=connector.supervisor_mode,
        webhook_secret=connector.webhook_secret,
        webhook_url=f"/webhooks/{connector.id}",
        is_enabled=connector.is_enabled,
        config=connector.config or {},
        created_at=connector.created_at.isoformat(),
        updated_at=connector.updated_at.isoformat(),
    )


@router.get("/types", response_model=ConnectorTypesListResponse)
async def list_connector_types() -> ConnectorTypesListResponse:
    metas = all_connector_types()
    items = [
        ConnectorTypeResponse(
            type_id=m.type_id,
            name=m.name,
            icon=m.icon,
            color=m.color,
            description=m.description,
            doc_url=m.doc_url,
            setup_steps=m.setup_steps,
            fields=[
                ConnectorFieldDefResponse(
                    key=f.key,
                    label=f.label,
                    placeholder=f.placeholder,
                    is_secret=f.is_secret,
                    is_required=f.is_required,
                )
                for f in m.fields
            ],
        )
        for m in metas
    ]
    return ConnectorTypesListResponse(items=items)


@router.get("", response_model=ConnectorListResponse, dependencies=[RequireAdmin])
async def list_connectors(
    user: CurrentUser,
    db: DbSession,
) -> ConnectorListResponse:
    result = await db.execute(select(Connector).order_by(Connector.created_at.desc()))
    connectors = list(result.scalars().all())
    return ConnectorListResponse(
        items=[to_response(c) for c in connectors],
        total=len(connectors),
    )


@router.post(
    "", response_model=ConnectorCreateResponse, status_code=201, dependencies=[RequireAdmin]
)
async def create_connector(
    data: ConnectorCreate,
    user: CurrentUser,
    db: DbSession,
) -> ConnectorCreateResponse:
    _validate_connector_type(data.connector_type)
    _validate_connector_config(data.connector_type, data.config)
    _validate_execution_target(data)
    await _verify_execution_target(data)

    connector = Connector(
        id=str(uuid4()),
        name=data.name,
        connector_type=data.connector_type,
        agent_id=data.agent_id,
        graph_id=data.graph_id,
        supervisor_mode=data.supervisor_mode,
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
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
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
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise_not_found("Connector")

    if data.name is not None:
        connector.name = data.name
    if data.agent_id is not None:
        await _verify_agent_exists(data.agent_id)
        connector.agent_id = data.agent_id
    if data.graph_id is not None:
        await _verify_graph_exists(data.graph_id)
        connector.graph_id = data.graph_id
    if data.supervisor_mode is not None:
        connector.supervisor_mode = data.supervisor_mode
    if data.is_enabled is not None:
        connector.is_enabled = data.is_enabled
    if data.config is not None:
        _validate_connector_config(connector.connector_type, data.config)
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
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise_not_found("Connector")
    await db.delete(connector)
    await db.commit()
