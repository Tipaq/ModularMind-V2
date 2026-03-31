"""FastAPI router for the System Indexer."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from src.infra.database import DbSession
from src.system_indexer import service
from src.system_indexer.schemas import (
    CreateSystemRequest,
    SearchRequest,
    SearchResponse,
    StructureResponse,
    SystemListResponse,
    SystemResponse,
)
from src.system_indexer.skimmer import skim_system

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/system-indexer", tags=["system-indexer"])


def _to_response(system) -> SystemResponse:
    return SystemResponse(
        id=system.id,
        name=system.name,
        system_type=system.system_type,
        base_url=system.base_url,
        mcp_server_id=system.mcp_server_id,
        unit_count=system.unit_count,
        relationship_count=system.relationship_count,
        status=system.status,
        last_indexed_at=system.last_indexed_at,
        created_at=system.created_at,
    )


@router.post("/systems", response_model=SystemResponse, status_code=201)
async def create_system(request: CreateSystemRequest, session: DbSession):
    system = await service.create_system(
        session,
        name=request.name,
        system_type=request.system_type,
        base_url=request.base_url,
    )
    return _to_response(system)


@router.get("/systems", response_model=SystemListResponse)
async def list_systems(session: DbSession):
    systems = await service.list_systems(session)
    return SystemListResponse(
        items=[_to_response(s) for s in systems],
        total=len(systems),
    )


@router.get("/systems/{system_id}", response_model=SystemResponse)
async def get_system(system_id: str, session: DbSession):
    system = await service.get_system(session, system_id)
    if not system:
        raise HTTPException(status_code=404, detail="System not found")
    return _to_response(system)


@router.delete("/systems/{system_id}", status_code=204)
async def delete_system(system_id: str, session: DbSession):
    deleted = await service.delete_system(session, system_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="System not found")


@router.get("/systems/{system_id}/structure", response_model=StructureResponse)
async def browse_structure(
    system_id: str,
    session: DbSession,
    kind: str | None = Query(default=None),
    depth: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    system = await service.get_system(session, system_id)
    if not system:
        raise HTTPException(status_code=404, detail="System not found")

    items, total = await service.browse_structure(
        system_id, kind=kind, depth=depth, limit=limit, offset=offset
    )
    return StructureResponse(items=items, total=total)


@router.post("/systems/{system_id}/search", response_model=SearchResponse)
async def search_system(
    system_id: str,
    request: SearchRequest,
    session: DbSession,
):
    system = await service.get_system(session, system_id)
    if not system:
        raise HTTPException(status_code=404, detail="System not found")

    from src.embedding import get_embedding_provider
    from src.infra.config import get_settings

    settings = get_settings()
    provider = get_embedding_provider(settings.EMBEDDING_PROVIDER)

    results = await service.search_system(
        session,
        system_id,
        query=request.query,
        embed_fn=provider.embed_texts,
        kind_filter=request.kind_filter,
        max_hops=request.max_hops,
        limit=request.limit,
    )
    return SearchResponse(results=results, total=len(results))


@router.get("/systems/{system_id}/skim")
async def skim(
    system_id: str,
    session: DbSession,
    max_tokens: int = Query(default=2000, ge=100, le=10000),
):
    system = await service.get_system(session, system_id)
    if not system:
        raise HTTPException(status_code=404, detail="System not found")

    text = await skim_system(system_id, max_tokens=max_tokens)
    return {"system_id": system_id, "skim": text}
