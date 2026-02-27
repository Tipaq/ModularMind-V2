"""Shared agent schemas — used by Engine for config loading and sync."""

from pydantic import BaseModel


class AgentConfig(BaseModel):
    """Agent configuration synced from Platform to Engine."""

    id: str
    name: str
    description: str
    model: str
    provider: str
    system_prompt: str | None = None
    tools: list[str] = []
    tags: list[str] = []
    version: int = 1
