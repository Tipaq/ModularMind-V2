"""Graph API schemas."""

from typing import Any

from pydantic import BaseModel

from src.infra.schemas import PaginatedResponse


class NodeDetail(BaseModel):
    """Full node representation (id, type, position, data)."""

    id: str
    type: str
    position: dict[str, float] | None = None
    data: dict[str, Any] = {}


class EdgeDetail(BaseModel):
    """Full edge representation."""

    id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None
    data: dict[str, Any] | None = None


class GraphSummary(BaseModel):
    """Graph summary for list view."""

    id: str
    name: str
    description: str
    version: int
    timeout_seconds: int
    node_count: int
    edge_count: int
    models: list[str] = []


class GraphDetail(GraphSummary):
    """Graph detail view."""

    entry_node_id: str | None
    nodes: list[NodeDetail]
    edges: list[EdgeDetail]
    config_version: int | None = None
    config_hash: str | None = None


class GraphListResponse(PaginatedResponse[GraphSummary]):
    """Graph list response."""
