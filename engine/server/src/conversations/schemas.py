"""
Conversation schemas.

Pydantic models for conversation requests and responses.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse


class ConversationCreate(BaseModel):
    """Conversation creation request."""

    agent_id: str | None = None
    title: str | None = None
    supervisor_mode: bool = False
    config: dict | None = None


class ConversationUpdate(BaseModel):
    """Conversation update request."""

    title: str | None = None
    supervisor_mode: bool | None = None
    config: dict | None = None


class MessageResponse(BaseModel):
    """Message response."""

    id: str
    role: str
    content: str
    metadata: dict = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    """Conversation response."""

    id: str
    agent_id: str | None = None
    user_email: str | None = None
    title: str | None
    is_active: bool
    supervisor_mode: bool = False
    config: dict = Field(default_factory=dict)
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailResponse(ConversationResponse):
    """Conversation detail with messages."""

    messages: list[MessageResponse] = Field(default_factory=list)


class ConversationListResponse(PaginatedResponse[ConversationResponse]):
    """Paginated conversation list."""


class SendMessageRequest(BaseModel):
    """Send message request."""

    content: str = Field(min_length=1, max_length=50000)


class MemoryEntryResponse(BaseModel):
    """Memory entry used during supervisor routing."""

    id: str
    content: str
    scope: str
    tier: str
    importance: float = 0.5
    memory_type: str = "episodic"
    category: str = ""


class SendMessageResponse(BaseModel):
    """Send message response with execution info."""

    user_message: MessageResponse
    execution_id: str | None = None
    message_id: str | None = None
    stream_url: str | None = None
    direct_response: str | None = None
    routing_strategy: str | None = None
    delegated_to: str | None = None
    is_ephemeral: bool | None = None
    ephemeral_agent: dict | None = None
    memory_entries: list[MemoryEntryResponse] = Field(default_factory=list)


# ─── Search Schemas ──────────────────────────────────────────────────────────


class ConversationSearchRequest(BaseModel):
    """Cross-conversation search request."""

    query: str = Field(min_length=1, max_length=1000)
    agent_id: str | None = None
    limit: int = Field(default=10, ge=1, le=50)
    threshold: float = Field(default=0.6, ge=0, le=1)
    include_group: bool = False


class ConversationSearchResultItem(BaseModel):
    """Search result item."""

    conversation_id: str
    conversation_title: str | None
    message_content: str
    score: float
    timestamp: str | None
    agent_id: str | None


class ConversationSearchResponse(BaseModel):
    """Cross-conversation search response."""

    results: list[ConversationSearchResultItem]
    total: int
