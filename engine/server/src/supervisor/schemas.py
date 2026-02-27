"""
Supervisor routing schemas.

Pydantic models for the Super Supervisor routing decisions,
parsed messages, sub-contexts, and configuration.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class RoutingStrategy(str, Enum):
    """Routing strategy decided by the supervisor."""

    DIRECT_RESPONSE = "DIRECT_RESPONSE"
    DELEGATE_AGENT = "DELEGATE_AGENT"
    EXECUTE_GRAPH = "EXECUTE_GRAPH"
    CREATE_AGENT = "CREATE_AGENT"
    MULTI_ACTION = "MULTI_ACTION"
    TOOL_RESPONSE = "TOOL_RESPONSE"


class RoutingDecision(BaseModel):
    """LLM routing decision output."""

    strategy: RoutingStrategy
    agent_id: str | None = None
    graph_id: str | None = None
    reasoning: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    direct_response: str | None = None
    ephemeral_config: dict | None = None
    sub_decisions: list[RoutingDecision] | None = None


class ParsedMessage(BaseModel):
    """Result of parsing a user message for explicit routing directives."""

    raw_content: str
    clean_content: str
    explicit_agent: str | None = None
    explicit_graph: str | None = None
    create_directive: bool = False
    create_instructions: str | None = None


class SubContext(BaseModel):
    """Agent-specific sub-context within a conversation."""

    agent_id: str
    messages: list[dict] = Field(default_factory=list)
    last_interaction: datetime
    execution_count: int = 0


class SupervisorConfig(BaseModel):
    """Configuration for the Super Supervisor."""

    model_id: str = "ollama:qwen3:8b"
    temperature: float = 0.1
    max_routing_tokens: int = 500
    session_affinity_threshold: float = 0.7
