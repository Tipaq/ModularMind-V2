"""
Agent schemas.

Pydantic models for agent API requests and responses.
"""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse


class RAGConfigCreate(BaseModel):
    """RAG configuration input."""

    enabled: bool = False
    collection_ids: list[UUID] = Field(default_factory=list)
    retrieval_count: int = Field(default=5, ge=1, le=20)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)


class AgentCreate(BaseModel):
    """Request body for creating an agent."""

    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    model_id: str = Field(
        min_length=1,
        pattern=r"^[a-zA-Z0-9_-]+:[a-zA-Z0-9_./-]+$",
        description="Format: provider:model (e.g. ollama:llama3.2)",
    )
    system_prompt: str = Field(default="", max_length=10000)
    memory_enabled: bool = True
    timeout_seconds: int = Field(default=120, ge=10, le=600)
    rag_config: RAGConfigCreate | None = None
    tool_categories: dict[str, bool] = Field(default_factory=dict)
    gateway_permissions: dict[str, Any] | None = None
    capabilities: list[str] = Field(default_factory=list)
    routing_metadata: dict[str, Any] = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    """Request body for updating an agent (patch semantics)."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    model_id: str | None = Field(
        default=None,
        pattern=r"^[a-zA-Z0-9_-]+:[a-zA-Z0-9_./-]+$",
    )
    system_prompt: str | None = Field(default=None, max_length=10000)
    memory_enabled: bool | None = None
    timeout_seconds: int | None = Field(default=None, ge=10, le=600)
    rag_config: RAGConfigCreate | None = None
    tool_categories: dict[str, bool] | None = None
    gateway_permissions: dict[str, Any] | None = None
    capabilities: list[str] | None = None
    routing_metadata: dict[str, Any] | None = None
    change_note: str | None = Field(default=None, max_length=500)


class DuplicateAgentRequest(BaseModel):
    """Request body for duplicating an agent."""

    name: str | None = Field(default=None, min_length=1, max_length=100)


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

    capabilities: list[str] = []
    gateway_permissions: dict[str, Any] | None = None
    routing_metadata: dict[str, Any] = {}
    config_version: int | None = None
    config_hash: str | None = None


class AgentListResponse(PaginatedResponse[AgentSummary]):
    """Agent list response."""
