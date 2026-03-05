"""Admin user management schemas.

Pydantic models for admin user endpoints.
"""

from datetime import datetime

from pydantic import BaseModel

from src.auth import UserRole
from src.infra.schemas import PaginatedResponse
from src.memory.schemas import MemoryEntryResponse, MemoryListResponse  # noqa: F401
from src.rag.models import RAGScope


class UserStatsResponse(BaseModel):
    id: str
    email: str
    role: UserRole
    is_active: bool
    conversation_count: int
    total_tokens_prompt: int
    total_tokens_completion: int
    execution_count: int
    estimated_cost_usd: float | None
    last_active_at: datetime | None
    created_at: datetime


class UserStatsListResponse(PaginatedResponse[UserStatsResponse]):
    pass


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None


class AdminUserUpdateResponse(BaseModel):
    id: str
    email: str
    role: UserRole
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeleteCountResponse(BaseModel):
    deleted_count: int


class AdminConversationItem(BaseModel):
    id: str
    agent_id: str | None
    title: str | None
    message_count: int
    tokens_prompt: int
    tokens_completion: int
    estimated_cost: float | None
    created_at: datetime
    updated_at: datetime


class AdminConversationListResponse(PaginatedResponse[AdminConversationItem]):
    pass


class AdminMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    metadata: dict | None
    execution_id: str | None
    created_at: datetime


class AdminConversationMessagesResponse(BaseModel):
    conversation_id: str
    user_id: str
    user_email: str
    messages: list[AdminMessageResponse]


class TokenUsageSummary(BaseModel):
    total_prompt: int
    total_completion: int
    estimated_cost_usd: float | None
    execution_count: int


class DailyTokenUsage(BaseModel):
    date: str  # YYYY-MM-DD
    tokens_prompt: int
    tokens_completion: int
    estimated_cost_usd: float | None
    execution_count: int


class ModelTokenUsage(BaseModel):
    model: str
    provider: str | None
    tokens_prompt: int
    tokens_completion: int
    estimated_cost_usd: float | None


class TokenUsageResponse(BaseModel):
    summary: TokenUsageSummary
    daily: list[DailyTokenUsage]
    by_model: list[ModelTokenUsage]


# MemoryListResponse imported from src.memory.schemas above


class CollectionResponse(BaseModel):
    id: str
    name: str
    scope: RAGScope
    owner_user_id: str | None
    allowed_groups: list[str]
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
