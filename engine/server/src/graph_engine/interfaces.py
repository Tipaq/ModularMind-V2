"""Data models and protocols for graph engine execution components."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol, runtime_checkable
from uuid import UUID  # noqa: F401 – used in RAGConfig annotation

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Protocols — structural type contracts for dependency injection
# ---------------------------------------------------------------------------


@runtime_checkable
class ConfigProviderProtocol(Protocol):
    """Structural contract for configuration providers (DI boundary)."""

    async def get_agent_config(self, agent_id: str) -> AgentConfig | None: ...
    async def get_graph_config(self, graph_id: str) -> GraphConfig | None: ...
    async def list_agents(self) -> list[AgentConfig]: ...


@runtime_checkable
class LLMProviderProtocol(Protocol):
    """Structural contract for LLM providers (DI boundary)."""

    async def get_model(self, model_id: str, **kwargs: Any) -> BaseChatModel: ...


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

    id: str  # UUID or CUID (platform-synced agents use CUIDs)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    system_prompt: str = Field(default="", max_length=10000)
    model_id: str = ""  # Format: provider:model (e.g., ollama:llama3.2)
    version: int = Field(default=1)
    timeout_seconds: int = Field(default=120, ge=10, le=600)
    memory_enabled: bool = True
    rag_config: RAGConfig = Field(default_factory=RAGConfig)
    capabilities: list[str] = Field(default_factory=list)  # ["code", "research", "email"]
    routing_metadata: dict[str, Any] = Field(default_factory=dict)
    gateway_permissions: dict[str, Any] | None = Field(
        default=None,
        description="Gateway permissions for system access tools (filesystem, shell, etc.)",
    )
    tool_categories: dict[str, bool] = Field(
        default_factory=lambda: {
            "knowledge": True,
            "filesystem": False,
            "file_storage": False,
            "human_interaction": True,
            "image_generation": False,
            "custom_tools": False,
            "mini_apps": False,
        },
        description="Enable/disable extended tool categories for this agent.",
    )

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

    id: str  # UUID or CUID (platform-synced graphs use CUIDs)
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
