"""
Agent schemas.

Pydantic models for agent API responses.
"""

from pydantic import BaseModel

from src.infra.schemas import PaginatedResponse


class AgentSummary(BaseModel):
    """Agent summary for list view."""

    id: str
    name: str
    description: str
    model_id: str
    version: int
    memory_enabled: bool
    timeout_seconds: int


class AgentDetail(AgentSummary):
    """Agent detail view."""

    system_prompt: str
    rag_enabled: bool
    rag_collection_ids: list[str]
    rag_retrieval_count: int
    rag_similarity_threshold: float
    config_version: int | None = None
    config_hash: str | None = None


class AgentListResponse(PaginatedResponse[AgentSummary]):
    """Agent list response."""
