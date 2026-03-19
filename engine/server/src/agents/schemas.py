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
    system_prompt: str = ""
    rag_enabled: bool = False
    rag_collection_ids: list[str] = []
    rag_retrieval_count: int = 5
    rag_similarity_threshold: float = 0.7
    tool_categories: dict[str, bool] = {}


class AgentDetail(AgentSummary):
    """Agent detail view with config metadata."""

    config_version: int | None = None
    config_hash: str | None = None


class AgentListResponse(PaginatedResponse[AgentSummary]):
    """Agent list response."""
