"""Mini-apps router — API endpoints for agent-created web applications."""

import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse

from src.auth import CurrentUser
from src.infra.database import DbSession

from .schemas import (
    FileReadResponse,
    FileWriteResponse,
    MiniAppCreate,
    MiniAppFileResponse,
    MiniAppFileWrite,
    MiniAppListResponse,
    MiniAppResponse,
    MiniAppUpdate,
    RollbackResponse,
    SnapshotResponse,
    StorageKeyResponse,
    StorageSetRequest,
    StorageValueResponse,
)
from .service import MiniAppService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mini-apps", tags=["Mini Apps"])


# ─── App CRUD ────────────────────────────────────────────────────────────


@router.get("", response_model=MiniAppListResponse)
async def list_apps(
    db: DbSession,
    _user: CurrentUser,
    scope: str | None = Query(None),
    agent_id: str | None = Query(None, alias="agentId"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> MiniAppListResponse:
    svc = MiniAppService(db)
    items, total = await svc.list_apps(scope, agent_id, search, page, page_size)
    return MiniAppListResponse(
        items=[MiniAppResponse.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=MiniAppResponse, status_code=201)
async def create_app(
    body: MiniAppCreate,
    db: DbSession,
    user: CurrentUser,
) -> MiniAppResponse:
    svc = MiniAppService(db)
    app = await svc.create_app(
        name=body.name,
        slug=body.slug,
        description=body.description,
        scope=body.scope,
        allowed_groups=body.allowed_groups,
        owner_user_id=body.owner_user_id or user.id,
        agent_id=body.agent_id,
        initial_html=body.initial_html,
    )
    return MiniAppResponse.model_validate(app)


@router.get("/{app_id}", response_model=MiniAppResponse)
async def get_app(
    app_id: str,
    db: DbSession,
    _user: CurrentUser,
) -> MiniAppResponse:
    svc = MiniAppService(db)
    app = await svc.get_app(app_id)
    if not app:
        raise HTTPException(404, "Mini-app not found")
    files = await svc.list_files(app_id)
    resp = MiniAppResponse.model_validate(app)
    resp.files = [MiniAppFileResponse.model_validate(f) for f in files]
    return resp


@router.patch("/{app_id}", response_model=MiniAppResponse)
async def update_app(
    app_id: str,
    body: MiniAppUpdate,
    db: DbSession,
    _user: CurrentUser,
) -> MiniAppResponse:
    svc = MiniAppService(db)
    app = await svc.update_app(app_id, body.model_dump(exclude_none=True))
    if not app:
        raise HTTPException(404, "Mini-app not found")
    return MiniAppResponse.model_validate(app)


@router.delete("/{app_id}", status_code=204)
async def delete_app(
    app_id: str,
    db: DbSession,
    _user: CurrentUser,
) -> None:
    svc = MiniAppService(db)
    if not await svc.delete_app(app_id):
        raise HTTPException(404, "Mini-app not found")


# ─── Files ───────────────────────────────────────────────────────────────


@router.get("/{app_id}/files", response_model=list[MiniAppFileResponse])
async def list_files(
    app_id: str,
    db: DbSession,
    _user: CurrentUser,
) -> list[MiniAppFileResponse]:
    svc = MiniAppService(db)
    files = await svc.list_files(app_id)
    return [MiniAppFileResponse.model_validate(f) for f in files]


@router.post("/{app_id}/files", response_model=FileWriteResponse, status_code=201)
async def write_file(
    app_id: str,
    body: MiniAppFileWrite,
    db: DbSession,
    _user: CurrentUser,
) -> FileWriteResponse:
    svc = MiniAppService(db)
    result = await svc.write_file(app_id, body.path, body.content, body.content_type)
    return FileWriteResponse(**result)


@router.get("/{app_id}/files/{path:path}", response_model=FileReadResponse)
async def read_file(
    app_id: str,
    path: str,
    db: DbSession,
    _user: CurrentUser,
) -> FileReadResponse:
    svc = MiniAppService(db)
    result = await svc.read_file(app_id, path)
    if not result:
        raise HTTPException(404, "File not found")
    return FileReadResponse(**result)


@router.delete("/{app_id}/files/{path:path}", status_code=204)
async def delete_file(
    app_id: str,
    path: str,
    db: DbSession,
    _user: CurrentUser,
) -> None:
    svc = MiniAppService(db)
    if not await svc.delete_file(app_id, path):
        raise HTTPException(404, "File not found")


# ─── Storage ─────────────────────────────────────────────────────────────


@router.get("/{app_id}/storage", response_model=list[StorageKeyResponse])
async def list_storage_keys(
    app_id: str,
    db: DbSession,
    _user: CurrentUser,
) -> list[StorageKeyResponse]:
    svc = MiniAppService(db)
    entries = await svc.list_storage_keys(app_id)
    return [StorageKeyResponse.model_validate(e) for e in entries]


@router.get("/{app_id}/storage/{key}", response_model=StorageValueResponse)
async def get_storage_value(
    app_id: str,
    key: str,
    db: DbSession,
    _user: CurrentUser,
) -> StorageValueResponse:
    svc = MiniAppService(db)
    entry_value = await svc.get_storage_value(app_id, key)
    if entry_value is None:
        raise HTTPException(404, "Storage key not found")
    entries = await svc.list_storage_keys(app_id)
    entry = next((e for e in entries if e.key == key), None)
    if not entry:
        raise HTTPException(404, "Storage key not found")
    return StorageValueResponse(key=key, value=entry_value, updated_at=entry.updated_at)


@router.put("/{app_id}/storage/{key}", status_code=204)
async def set_storage_value(
    app_id: str,
    key: str,
    body: StorageSetRequest,
    db: DbSession,
    _user: CurrentUser,
) -> None:
    svc = MiniAppService(db)
    await svc.set_storage_value(app_id, key, body.value)


@router.delete("/{app_id}/storage/{key}", status_code=204)
async def delete_storage_value(
    app_id: str,
    key: str,
    db: DbSession,
    _user: CurrentUser,
) -> None:
    svc = MiniAppService(db)
    if not await svc.delete_storage_value(app_id, key):
        raise HTTPException(404, "Storage key not found")


# ─── Snapshots ───────────────────────────────────────────────────────────


@router.get("/{app_id}/snapshots", response_model=list[SnapshotResponse])
async def list_snapshots(
    app_id: str,
    db: DbSession,
    _user: CurrentUser,
) -> list[SnapshotResponse]:
    svc = MiniAppService(db)
    snaps = await svc.list_snapshots(app_id)
    return [SnapshotResponse.model_validate(s) for s in snaps]


@router.post("/{app_id}/snapshots", response_model=SnapshotResponse, status_code=201)
async def create_snapshot(
    app_id: str,
    db: DbSession,
    _user: CurrentUser,
) -> SnapshotResponse:
    svc = MiniAppService(db)
    snap = await svc.create_snapshot(app_id)
    return SnapshotResponse.model_validate(snap)


@router.post(
    "/{app_id}/snapshots/{version}/rollback",
    response_model=RollbackResponse,
)
async def rollback_snapshot(
    app_id: str,
    version: int,
    db: DbSession,
    _user: CurrentUser,
) -> RollbackResponse:
    svc = MiniAppService(db)
    result = await svc.rollback_snapshot(app_id, version)
    return RollbackResponse(**result)


# ─── Serve (public, no auth) ────────────────────────────────────────────


@router.get("/{app_id}/serve", response_class=HTMLResponse)
async def serve_app(
    app_id: str,
    db: DbSession,
    theme: str | None = Query(None),
) -> HTMLResponse:
    svc = MiniAppService(db)
    html = await svc.render_serve_html(app_id, theme)
    if not html:
        raise HTTPException(404, "Mini-app not found or inactive")
    return HTMLResponse(
        content=html,
        headers={"Content-Security-Policy": "frame-ancestors *"},
    )
