"""Shared sync schemas — push payloads from Studio to Engine."""

from pydantic import BaseModel

from .agents import AgentConfig
from .graphs import GraphConfig


class SyncPushPayload(BaseModel):
    """Payload sent from Studio to Engine via POST /sync/push."""

    agents: list[AgentConfig] = []
    graphs: list[GraphConfig] = []
    prompt_layers: dict[str, str] = {}
    version: int
    checksum: str
