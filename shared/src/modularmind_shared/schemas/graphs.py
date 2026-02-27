"""Shared graph schemas — used by both Studio (push) and Engine (receive)."""

from pydantic import BaseModel


class GraphNodeConfig(BaseModel):
    id: str
    type: str
    data: dict = {}
    position: dict = {"x": 0, "y": 0}


class GraphEdgeConfig(BaseModel):
    id: str
    source: str
    target: str
    condition: str | None = None


class GraphConfig(BaseModel):
    """Graph configuration pushed from Studio to Engine."""

    id: str
    name: str
    description: str
    nodes: list[GraphNodeConfig] = []
    edges: list[GraphEdgeConfig] = []
    version: int = 1
