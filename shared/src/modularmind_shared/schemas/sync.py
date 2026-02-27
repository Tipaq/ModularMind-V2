"""Shared sync schemas — manifests and config payloads for pull-based sync."""

from pydantic import BaseModel

from .agents import AgentConfig
from .graphs import GraphConfig


class SyncManifest(BaseModel):
    """Manifest returned by Platform GET /api/sync/manifest."""

    version: int
    agent_count: int = 0
    graph_count: int = 0


class SyncConfigPayload(BaseModel):
    """Config payload returned by Platform GET /api/sync/configs."""

    agents: list[AgentConfig] = []
    graphs: list[GraphConfig] = []
    prompt_layers: dict[str, str] = {}
    version: int
