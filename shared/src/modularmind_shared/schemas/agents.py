"""Shared agent schemas — used by both Studio (push) and Engine (receive)."""

from pydantic import BaseModel


class AgentConfig(BaseModel):
    """Agent configuration pushed from Studio to Engine."""

    id: str
    name: str
    description: str
    model: str
    provider: str
    system_prompt: str | None = None
    tools: list[str] = []
    tags: list[str] = []
    version: int = 1
