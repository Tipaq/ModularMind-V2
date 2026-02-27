"""Data models for graph engine execution components."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class RAGConfig(BaseModel):
    """RAG configuration for an agent."""

    enabled: bool = False
    collection_ids: list[UUID] = Field(default_factory=list)
    retrieval_count: int = Field(default=5, ge=1, le=20)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)


def _coerce_version(v: Any) -> int:
    """Coerce legacy string versions to int. Shared by AgentConfig and GraphConfig."""
    if isinstance(v, int):
        return v
    if isinstance(v, str):
        try:
            return int(v.split(".")[0])  # "1.0.0" → 1
        except (ValueError, IndexError):
            return 1
    return 1


class AgentConfig(BaseModel):
    """Agent configuration model."""

    id: UUID
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    system_prompt: str = Field(min_length=1, max_length=10000)
    model_id: str  # Format: provider:model (e.g., ollama:llama3.2)
    version: int = Field(default=1)
    timeout_seconds: int = Field(default=120, ge=10, le=600)
    memory_enabled: bool = True
    rag_config: RAGConfig = Field(default_factory=RAGConfig)
    capabilities: list[str] = Field(default_factory=list)  # ["code", "research", "email"]
    routing_metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("version", mode="before")
    @classmethod
    def coerce_version(cls, v: Any) -> int:
        return _coerce_version(v)


class NodeConfig(BaseModel):
    """Graph node configuration."""

    id: str
    type: str  # start, end, agent, tool, condition, parallel, merge, subgraph
    data: dict[str, Any] = Field(default_factory=dict)


class EdgeConfig(BaseModel):
    """Graph edge configuration."""

    id: str = ""
    source: str
    target: str
    data: dict[str, Any] = Field(default_factory=dict)


class GraphConfig(BaseModel):
    """Graph configuration model."""

    id: UUID
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    version: int = Field(default=1)
    timeout_seconds: int = Field(default=300, ge=10, le=600)
    entry_node_id: str | None = None
    nodes: list[NodeConfig] = Field(default_factory=list)
    edges: list[EdgeConfig] = Field(default_factory=list)

    @field_validator("version", mode="before")
    @classmethod
    def coerce_version(cls, v: Any) -> int:
        return _coerce_version(v)


class ConfigVersion(BaseModel):
    """Version information for a configuration."""

    config_hash: str  # SHA256 of normalized JSON
    loaded_at: datetime


