"""
Graph service.

Business logic for graph CRUD operations with versioned storage.
"""

import logging
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config import get_config_provider
from src.domain_config.repository import ConfigRepository
from src.graph_engine.interfaces import GraphConfig

from .schemas import (
    EdgeCreate,
    EdgeDetail,
    GraphCreate,
    GraphDetail,
    GraphUpdate,
    NodeCreate,
    NodeDetail,
)

logger = logging.getLogger(__name__)


def _validate_graph_integrity(
    nodes: list[NodeCreate],
    edges: list[EdgeCreate],
    entry_node_id: str | None,
) -> None:
    node_ids = {n.id for n in nodes}

    for edge in edges:
        if edge.source not in node_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Edge source '{edge.source}' references non-existent node",
            )
        if edge.target not in node_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Edge target '{edge.target}' references non-existent node",
            )

    if entry_node_id and entry_node_id not in node_ids:
        raise HTTPException(
            status_code=422,
            detail=f"entry_node_id '{entry_node_id}' references non-existent node",
        )


def _build_config_dict(
    graph_id: str,
    name: str,
    description: str,
    nodes: list[NodeCreate],
    edges: list[EdgeCreate],
    timeout_seconds: int,
    entry_node_id: str | None,
) -> dict[str, Any]:
    return {
        "id": graph_id,
        "name": name,
        "description": description,
        "timeout_seconds": timeout_seconds,
        "entry_node_id": entry_node_id,
        "nodes": [{"id": n.id, "type": n.type, "data": n.data} for n in nodes],
        "edges": [
            {"id": e.id or str(uuid4())[:8], "source": e.source, "target": e.target, "data": e.data}
            for e in edges
        ],
    }


def _config_to_detail(
    config: GraphConfig,
    config_version: int | None = None,
    config_hash: str | None = None,
) -> GraphDetail:
    nodes = [NodeDetail(id=n.id, type=n.type, data=n.data) for n in config.nodes]
    edges = [
        EdgeDetail(
            id=e.id,
            source=e.source,
            target=e.target,
            data=e.data if e.data else None,
        )
        for e in config.edges
    ]
    return GraphDetail(
        id=str(config.id),
        name=config.name,
        description=config.description,
        version=config.version,
        timeout_seconds=config.timeout_seconds,
        node_count=len(config.nodes),
        edge_count=len(config.edges),
        entry_node_id=config.entry_node_id,
        nodes=nodes,
        edges=edges,
        config_version=config_version,
        config_hash=config_hash,
    )


async def create_graph(
    db: AsyncSession,
    body: GraphCreate,
    user_id: str,
) -> GraphDetail:
    _validate_graph_integrity(body.nodes, body.edges, body.entry_node_id)

    graph_id = str(uuid4())
    config_dict = _build_config_dict(
        graph_id,
        body.name,
        body.description,
        body.nodes,
        body.edges,
        body.timeout_seconds,
        body.entry_node_id,
    )
    GraphConfig.model_validate(config_dict)

    repo = ConfigRepository(db)
    row = await repo.create_graph_version(
        graph_id,
        config_dict,
        created_by=user_id,
        change_note="Created",
    )
    await db.commit()
    await get_config_provider().reload_async()

    validated = GraphConfig.model_validate(row.config | {"id": row.id})
    return _config_to_detail(validated, config_version=row.version, config_hash=row.config_hash)


async def update_graph(
    db: AsyncSession,
    graph_id: str,
    body: GraphUpdate,
    user_id: str,
) -> GraphDetail:
    repo = ConfigRepository(db)
    existing = await repo.get_active_graph(graph_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Graph not found")

    config = dict(existing.config)

    if body.name is not None:
        config["name"] = body.name
    if body.description is not None:
        config["description"] = body.description
    if body.timeout_seconds is not None:
        config["timeout_seconds"] = body.timeout_seconds
    if body.entry_node_id is not None:
        config["entry_node_id"] = body.entry_node_id

    if body.nodes is not None:
        config["nodes"] = [{"id": n.id, "type": n.type, "data": n.data} for n in body.nodes]
    if body.edges is not None:
        config["edges"] = [
            {"id": e.id or str(uuid4())[:8], "source": e.source, "target": e.target, "data": e.data}
            for e in body.edges
        ]

    if body.nodes is not None or body.edges is not None:
        current_nodes = [NodeCreate(**n) for n in config.get("nodes", [])]
        current_edges = [EdgeCreate(**e) for e in config.get("edges", [])]
        _validate_graph_integrity(current_nodes, current_edges, config.get("entry_node_id"))

    GraphConfig.model_validate(config | {"id": graph_id})

    row = await repo.create_graph_version(
        graph_id,
        config,
        created_by=user_id,
        change_note=body.change_note or "Updated",
    )
    await db.commit()
    await get_config_provider().reload_async()

    validated = GraphConfig.model_validate(row.config | {"id": row.id})
    return _config_to_detail(validated, config_version=row.version, config_hash=row.config_hash)


async def delete_graph(db: AsyncSession, graph_id: str) -> None:
    repo = ConfigRepository(db)
    existing = await repo.get_active_graph(graph_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Graph not found")

    await repo.delete_graph(graph_id)
    await db.commit()
    await get_config_provider().reload_async()


async def duplicate_graph(
    db: AsyncSession,
    graph_id: str,
    user_id: str,
    new_name: str | None = None,
) -> GraphDetail:
    repo = ConfigRepository(db)
    existing = await repo.get_active_graph(graph_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Graph not found")

    config = dict(existing.config)
    new_id = str(uuid4())

    id_mapping: dict[str, str] = {}
    new_nodes = []
    for node in config.get("nodes", []):
        old_id = node["id"]
        new_node_id = str(uuid4())[:8]
        id_mapping[old_id] = new_node_id
        new_nodes.append({**node, "id": new_node_id})

    new_edges = []
    for edge in config.get("edges", []):
        new_edges.append(
            {
                **edge,
                "id": str(uuid4())[:8],
                "source": id_mapping.get(edge["source"], edge["source"]),
                "target": id_mapping.get(edge["target"], edge["target"]),
            }
        )

    old_entry = config.get("entry_node_id")
    new_entry = id_mapping.get(old_entry, old_entry) if old_entry else None

    config["id"] = new_id
    config["name"] = new_name or f"{config.get('name', 'Graph')} (copy)"
    config["nodes"] = new_nodes
    config["edges"] = new_edges
    config["entry_node_id"] = new_entry

    GraphConfig.model_validate(config)

    row = await repo.create_graph_version(
        new_id,
        config,
        created_by=user_id,
        change_note=f"Duplicated from {graph_id}",
    )
    await db.commit()
    await get_config_provider().reload_async()

    validated = GraphConfig.model_validate(row.config | {"id": row.id})
    return _config_to_detail(validated, config_version=row.version, config_hash=row.config_hash)
