"""
Execution schemas.

Pydantic models for execution requests and responses.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse

from .models import ExecutionStatus, ExecutionType


class RAGOverride(BaseModel):
    """RAG configuration override."""

    enabled: bool = True
    collection_ids: list[str] = Field(default_factory=list)


class ExecutionCreate(BaseModel):
    """Execution creation request."""

    prompt: str = Field(min_length=1)
    session_id: str | None = None
    input_data: dict[str, Any] | None = None
    rag_override: RAGOverride | None = None


class ExecutionStepResponse(BaseModel):
    """Execution step response."""

    id: str
    step_number: int
    node_id: str
    node_type: str
    parent_step_id: str | None = None
    status: ExecutionStatus
    input_data: dict[str, Any]
    output_data: dict[str, Any] | None
    error_message: str | None
    tokens_prompt: int
    tokens_completion: int
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None

    model_config = {"from_attributes": True}


class ExecutionResponse(BaseModel):
    """Execution response."""

    id: str
    execution_type: ExecutionType
    agent_id: str | None
    graph_id: str | None
    session_id: str | None
    user_id: str
    status: ExecutionStatus
    config_version: int | None = None
    config_hash: str | None = None
    input_prompt: str
    input_data: dict[str, Any]
    output_data: dict[str, Any] | None
    error_message: str | None
    tokens_prompt: int
    tokens_completion: int
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    steps: list[ExecutionStepResponse] = Field(default_factory=list)
    approval_node_id: str | None = None
    approval_timeout_at: datetime | None = None

    model_config = {"from_attributes": True}


class ExecutionCreatedResponse(BaseModel):
    """Response after creating an execution."""

    id: str
    status: ExecutionStatus
    config_version: int | None = None
    config_hash: str | None = None
    created_at: datetime
    stream_url: str


class ExecutionListResponse(PaginatedResponse[ExecutionResponse]):
    """Paginated execution list response."""


class ApprovalRequest(BaseModel):
    """Approval/rejection request body."""

    notes: str | None = None
    gateway_approval_id: str | None = None
