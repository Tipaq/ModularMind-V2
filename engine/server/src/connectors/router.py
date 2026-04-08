"""Connector router — scoped CRUD + credential management + connector types metadata."""

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.sql import func

from src.auth import CurrentUser, RequireAdmin
from src.connectors.credentials import CredentialService
from src.connectors.models import Connector, ConnectorCredential
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
    CredentialCreate,
    CredentialResponse,
)
from src.domain_config import get_config_provider
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found
from src.projects.models import ProjectMember

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connectors", tags=["Connectors"])
project_connector_router = APIRouter(
    prefix="/projects", tags=["Project Connectors"]
)

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
        return
    allowed = adapter.allowed_config_keys() | EXECUTION_CONFIG_KEYS
    unexpected = set(config.keys()) - allowed
    if unexpected:
        raise HTTPException(
            status_code=422,
            detail=f"Unexpected config keys for {connector_type}: {sorted(unexpected)}",
        )


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


async def _get_user_project_ids(db: DbSession, user_id: str) -> list[str]:
    result = await db.execute(
        select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    )
    return [row[0] for row in result.all()]


async def _check_connector_access(
    connector: Connector, user: CurrentUser, db: DbSession, require_write: bool = False
) -> None:
    """Verify user has access to this connector based on scope."""
    if user.role.value in ("admin", "owner"):
        return

    if connector.user_id == user.id:
        return

    if connector.project_id:
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == connector.project_id,
                ProjectMember.user_id == user.id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        if require_write and member.role == "viewer":
            raise HTTPException(status_code=403, detail="Requires editor role or higher")
        return

    if connector.scope == "global":
        if require_write:
            raise HTTPException(status_code=403, detail="Admin required for global connectors")
        return

    raise HTTPException(status_code=403, detail="Access denied")


async def _enrich_response(
    connector: Connector, db: DbSession, user_id: str | None = None
) -> ConnectorResponse:
    cred_count = await db.execute(
        select(func.count())
        .select_from(ConnectorCredential)
        .where(ConnectorCredential.connector_id == connector.id)
    )
    credential_count = cred_count.scalar() or 0

    has_user_cred = False
    if user_id:
        user_cred = await db.execute(
            select(ConnectorCredential.id)
            .where(
                ConnectorCredential.connector_id == connector.id,
                ConnectorCredential.user_id == user_id,
                ConnectorCredential.is_valid.is_(True),
            )
            .limit(1)
        )
        has_user_cred = user_cred.scalar_one_or_none() is not None

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
        scope=connector.scope,
        user_id=connector.user_id,
        project_id=connector.project_id,
        has_spec=connector.spec is not None,
        credential_count=credential_count,
        has_user_credential=has_user_cred,
        created_at=connector.created_at.isoformat(),
        updated_at=connector.updated_at.isoformat(),
    )


def _to_create_response(connector: Connector) -> ConnectorCreateResponse:
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
        scope=connector.scope,
        user_id=connector.user_id,
        project_id=connector.project_id,
        has_spec=connector.spec is not None,
        credential_count=0,
        has_user_credential=False,
        created_at=connector.created_at.isoformat(),
        updated_at=connector.updated_at.isoformat(),
    )


@router.get("/types", response_model=ConnectorTypesListResponse)
async def list_connector_types() -> ConnectorTypesListResponse:
    from src.connectors.catalog import get_catalog

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

    for entry in get_catalog():
        auth_modes = entry.spec.get("auth", {}).get("modes", [])
        fields = []
        for mode in auth_modes:
            for field in mode.get("fields", []):
                fields.append(
                    ConnectorFieldDefResponse(
                        key=field["key"],
                        label=field.get("label", field["key"]),
                        placeholder=field.get("placeholder", ""),
                        is_secret=field.get("is_secret", True),
                        is_required=field.get("is_required", True),
                    )
                )
        items.append(
            ConnectorTypeResponse(
                type_id=entry.type_id,
                name=entry.name,
                icon=entry.icon,
                color=entry.color,
                description=entry.description,
                doc_url="",
                setup_steps=[],
                fields=fields,
            )
        )

    return ConnectorTypesListResponse(items=items)


@router.get("/mine", response_model=ConnectorListResponse)
async def list_my_connectors(
    user: CurrentUser,
    db: DbSession,
) -> ConnectorListResponse:
    """List connectors visible to the current user (own + project + global)."""
    project_ids = await _get_user_project_ids(db, user.id)

    conditions = [
        Connector.user_id == user.id,
        Connector.user_id.is_(None) & Connector.project_id.is_(None),
    ]
    if project_ids:
        conditions.append(Connector.project_id.in_(project_ids))

    result = await db.execute(
        select(Connector).where(or_(*conditions)).order_by(Connector.created_at.desc())
    )
    connectors = list(result.scalars().all())
    items = [await _enrich_response(c, db, user.id) for c in connectors]
    return ConnectorListResponse(items=items, total=len(items))


@router.get("/all", response_model=ConnectorListResponse, dependencies=[RequireAdmin])
async def list_all_connectors(
    user: CurrentUser,
    db: DbSession,
) -> ConnectorListResponse:
    """List all connectors (admin only)."""
    result = await db.execute(select(Connector).order_by(Connector.created_at.desc()))
    connectors = list(result.scalars().all())
    items = [await _enrich_response(c, db, user.id) for c in connectors]
    return ConnectorListResponse(items=items, total=len(items))


@router.post("", response_model=ConnectorCreateResponse, status_code=201)
async def create_connector(
    data: ConnectorCreate,
    user: CurrentUser,
    db: DbSession,
) -> ConnectorCreateResponse:
    """Create a connector. Defaults to user-scoped unless project_id is given."""
    if data.connector_type in registered_type_ids():
        _validate_connector_config(data.connector_type, data.config)
    _validate_execution_target(data)
    await _verify_execution_target(data)

    user_id = user.id
    project_id = data.project_id

    if project_id:
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id,
            )
        )
        member = result.scalar_one_or_none()
        is_admin = user.role.value in ("admin", "owner")
        if not member and not is_admin:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        if member and member.role == "viewer" and not is_admin:
            raise HTTPException(status_code=403, detail="Requires editor role or higher")
        user_id = None

    spec = data.spec
    if not spec:
        from src.connectors.catalog import get_catalog_entry

        catalog_entry = get_catalog_entry(data.connector_type)
        if catalog_entry:
            spec = catalog_entry.spec

    connector = Connector(
        id=str(uuid4()),
        name=data.name,
        connector_type=data.connector_type,
        agent_id=data.agent_id,
        graph_id=data.graph_id,
        supervisor_mode=data.supervisor_mode,
        config=data.config,
        user_id=user_id if not project_id else None,
        project_id=project_id,
        spec=spec,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return _to_create_response(connector)


@router.post(
    "/global",
    response_model=ConnectorCreateResponse,
    status_code=201,
    dependencies=[RequireAdmin],
)
async def create_global_connector(
    data: ConnectorCreate,
    user: CurrentUser,
    db: DbSession,
) -> ConnectorCreateResponse:
    """Create a global connector (admin only)."""
    if data.connector_type in registered_type_ids():
        _validate_connector_config(data.connector_type, data.config)
    _validate_execution_target(data)
    await _verify_execution_target(data)

    spec = data.spec
    if not spec:
        from src.connectors.catalog import get_catalog_entry

        catalog_entry = get_catalog_entry(data.connector_type)
        if catalog_entry:
            spec = catalog_entry.spec

    connector = Connector(
        id=str(uuid4()),
        name=data.name,
        connector_type=data.connector_type,
        agent_id=data.agent_id,
        graph_id=data.graph_id,
        supervisor_mode=data.supervisor_mode,
        config=data.config,
        user_id=None,
        project_id=None,
        spec=spec,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return _to_create_response(connector)


@router.get("/{connector_id}", response_model=ConnectorResponse)
async def get_connector(
    connector_id: str,
    user: CurrentUser,
    db: DbSession,
) -> ConnectorResponse:
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise_not_found("Connector")
    await _check_connector_access(connector, user, db)
    return await _enrich_response(connector, db, user.id)


@router.put("/{connector_id}", response_model=ConnectorResponse)
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
    await _check_connector_access(connector, user, db, require_write=True)

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
        if connector.connector_type in registered_type_ids():
            _validate_connector_config(connector.connector_type, data.config)
        connector.config = data.config
    if data.spec is not None:
        connector.spec = data.spec

    await db.commit()
    await db.refresh(connector)
    return await _enrich_response(connector, db, user.id)


@router.delete("/{connector_id}", status_code=204)
async def delete_connector(
    connector_id: str,
    user: CurrentUser,
    db: DbSession,
) -> None:
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise_not_found("Connector")
    await _check_connector_access(connector, user, db, require_write=True)
    await db.delete(connector)
    await db.commit()


@router.post("/{connector_id}/credentials", response_model=CredentialResponse, status_code=201)
async def add_credential(
    connector_id: str,
    data: CredentialCreate,
    user: CurrentUser,
    db: DbSession,
) -> CredentialResponse:
    """Add a credential to a connector."""
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise_not_found("Connector")
    await _check_connector_access(connector, user, db, require_write=True)

    is_shared = connector.scope == "global" or connector.scope == "project"
    credential_user_id = None if is_shared else user.id

    service = CredentialService(db)
    credential = await service.store_credential(
        connector_id=connector_id,
        credential_type=data.credential_type,
        label=data.label,
        value=data.value,
        user_id=credential_user_id,
        refresh_token=data.refresh_token,
        provider=data.provider,
        scopes=data.scopes,
    )
    await db.commit()
    return CredentialResponse(
        id=credential.id,
        connector_id=credential.connector_id,
        user_id=credential.user_id,
        credential_type=credential.credential_type,
        label=credential.label,
        provider=credential.provider,
        scopes=credential.scopes,
        is_valid=credential.is_valid,
        is_shared=credential.user_id is None,
        created_at=credential.created_at.isoformat() if credential.created_at else "",
        updated_at=credential.updated_at.isoformat() if credential.updated_at else "",
    )


@router.get("/{connector_id}/credentials", response_model=list[CredentialResponse])
async def list_credentials(
    connector_id: str,
    user: CurrentUser,
    db: DbSession,
) -> list[CredentialResponse]:
    """List credentials for a connector (values redacted)."""
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise_not_found("Connector")
    await _check_connector_access(connector, user, db)

    service = CredentialService(db)
    creds = await service.list_for_connector(connector_id)
    return [CredentialResponse(**c) for c in creds]


@router.delete("/{connector_id}/credentials/{credential_id}", status_code=204)
async def delete_credential(
    connector_id: str,
    credential_id: str,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a credential."""
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise_not_found("Connector")
    await _check_connector_access(connector, user, db, require_write=True)

    service = CredentialService(db)
    await service.delete_credential(credential_id)
    await db.commit()


# ─── Project-scoped connector endpoints ─────────────────────────────


@project_connector_router.get(
    "/{project_id}/connectors",
    response_model=ConnectorListResponse,
)
async def list_project_connectors(
    project_id: str,
    user: CurrentUser,
    db: DbSession,
) -> ConnectorListResponse:
    """List connectors scoped to a project (+ global)."""
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    is_admin = user.role.value in ("admin", "owner")
    if not result.scalar_one_or_none() and not is_admin:
        raise HTTPException(
            status_code=403, detail="Not a project member"
        )

    query = select(Connector).where(
        or_(
            Connector.project_id == project_id,
            Connector.user_id.is_(None) & Connector.project_id.is_(None),
        )
    ).order_by(Connector.created_at.desc())

    rows = await db.execute(query)
    connectors = list(rows.scalars().all())
    items = [
        await _enrich_response(c, db, user.id)
        for c in connectors
    ]
    return ConnectorListResponse(items=items, total=len(items))
