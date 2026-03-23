"""Graph API schemas for requests and responses."""

from typing import Any

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse

VALID_NODE_TYPES = frozenset(
    {
        "start",
        "end",
        "agent",
        "tool",
        "subgraph",
        "condition",
        "parallel",
        "merge",
        "loop",
        "supervisor",
    }
)


class NodeCreate(BaseModel):
    """Node input for graph creation/update."""

    id: str = Field(min_length=1)
    type: str = Field(min_length=1)
    data: dict[str, Any] = Field(default_factory=dict)


class EdgeCreate(BaseModel):
    """Edge input for graph creation/update."""

    id: str = ""
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    data: dict[str, Any] = Field(default_factory=dict)


class GraphCreate(BaseModel):
    """Request body for creating a graph."""

    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    nodes: list[NodeCreate] = Field(default_factory=list)
    edges: list[EdgeCreate] = Field(default_factory=list)
    timeout_seconds: int = Field(default=300, ge=10, le=600)
    entry_node_id: str | None = None


class GraphUpdate(BaseModel):
    """Request body for updating a graph (patch semantics)."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    nodes: list[NodeCreate] | None = None
    edges: list[EdgeCreate] | None = None
    timeout_seconds: int | None = Field(default=None, ge=10, le=600)
    entry_node_id: str | None = None
    change_note: str | None = Field(default=None, max_length=500)


class DuplicateGraphRequest(BaseModel):
    """Request body for duplicating a graph."""

    name: str | None = Field(default=None, min_length=1, max_length=100)


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
