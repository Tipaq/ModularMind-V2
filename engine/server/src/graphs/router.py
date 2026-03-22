"""
Graphs router.

API endpoints for graph CRUD and listing.
"""

import asyncio

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from src.auth import CurrentUser, RequireOwner
from src.domain_config import get_config_provider
from src.infra.database import DbSession

from . import service
from .schemas import (
    DuplicateGraphRequest,
    EdgeDetail,
    GraphCreate,
    GraphDetail,
    GraphListResponse,
    GraphSummary,
    GraphUpdate,
    NodeDetail,
)

router = APIRouter(prefix="/graphs", tags=["Graphs"])


@router.get("", response_model=GraphListResponse)
async def list_graphs(
    user: CurrentUser,
    page: int = 1,
    page_size: int = 20,
    version: int | None = None,
    search: str | None = None,
) -> GraphListResponse:
    """List available graphs."""
    config_provider = get_config_provider()
    graphs = await config_provider.list_graphs()

    if version:
        graphs = [g for g in graphs if g.version == version]

    if search:
        q = search.lower()
        graphs = [g for g in graphs if q in g.name.lower() or q in (g.description or "").lower()]

    total = len(graphs)
    start = (page - 1) * page_size
    page_graphs = graphs[start : start + page_size]

    all_agent_ids: set[str] = set()
    for g in page_graphs:
        for node in g.nodes:
            agent_id = (node.data.get("config") or {}).get("agentId") or node.data.get("agent_id")
            if agent_id:
                all_agent_ids.add(str(agent_id))

    agent_configs = dict(
        zip(
            all_agent_ids,
            await asyncio.gather(*(config_provider.get_agent_config(aid) for aid in all_agent_ids)),
            strict=False,
        )
    )

    items: list[GraphSummary] = []
    for g in page_graphs:
        model_ids: list[str] = []
        seen: set[str] = set()
        for node in g.nodes:
            agent_id = (node.data.get("config") or {}).get("agentId") or node.data.get("agent_id")
            if not agent_id:
                continue
            agent_cfg = agent_configs.get(str(agent_id))
            if agent_cfg and agent_cfg.model_id not in seen:
                seen.add(agent_cfg.model_id)
                model_ids.append(agent_cfg.model_id)
        items.append(
            GraphSummary(
                id=str(g.id),
                name=g.name,
                description=g.description,
                version=g.version,
                timeout_seconds=g.timeout_seconds,
                node_count=len(g.nodes),
                edge_count=len(g.edges),
                models=model_ids,
            )
        )

    return GraphListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{graph_id}", response_model=GraphDetail)
async def get_graph(graph_id: str, user: CurrentUser) -> GraphDetail:
    """Get graph details."""
    config_provider = get_config_provider()
    graph = await config_provider.get_graph_config(graph_id)

    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    config_hash = config_provider.get_config_version("graph", graph_id)
    version_number = config_provider.get_config_version_number("graph", graph_id)

    nodes = [NodeDetail(id=n.id, type=n.type, data=n.data) for n in graph.nodes]
    edges = [
        EdgeDetail(
            id=e.id,
            source=e.source,
            target=e.target,
            data=e.data if e.data else None,
        )
        for e in graph.edges
    ]

    return GraphDetail(
        id=str(graph.id),
        name=graph.name,
        description=graph.description,
        version=graph.version,
        timeout_seconds=graph.timeout_seconds,
        node_count=len(graph.nodes),
        edge_count=len(graph.edges),
        entry_node_id=graph.entry_node_id,
        nodes=nodes,
        edges=edges,
        config_version=version_number,
        config_hash=config_hash,
    )


@router.post(
    "",
    response_model=GraphDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireOwner],
)
async def create_graph(body: GraphCreate, user: CurrentUser, db: DbSession) -> GraphDetail:
    """Create a new graph."""
    try:
        return await service.create_graph(db, body, user.id)
    except IntegrityError as err:
        raise HTTPException(status_code=409, detail="Graph creation conflict") from err


@router.patch(
    "/{graph_id}",
    response_model=GraphDetail,
    dependencies=[RequireOwner],
)
async def update_graph(
    graph_id: str,
    body: GraphUpdate,
    user: CurrentUser,
    db: DbSession,
) -> GraphDetail:
    """Update an existing graph (creates a new version)."""
    return await service.update_graph(db, graph_id, body, user.id)


@router.delete(
    "/{graph_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireOwner],
)
async def delete_graph(graph_id: str, db: DbSession) -> None:
    """Delete a graph and all its versions."""
    await service.delete_graph(db, graph_id)


@router.post(
    "/{graph_id}/duplicate",
    response_model=GraphDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireOwner],
)
async def duplicate_graph(
    graph_id: str,
    user: CurrentUser,
    db: DbSession,
    body: DuplicateGraphRequest | None = None,
) -> GraphDetail:
    """Duplicate an existing graph."""
    new_name = body.name if body else None
    return await service.duplicate_graph(db, graph_id, user.id, new_name)
