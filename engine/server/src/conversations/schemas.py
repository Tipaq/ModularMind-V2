"""
Conversation schemas.

Pydantic models for conversation requests and responses.
"""

from datetime import datetime
from typing import Any, TypedDict

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse


class ConversationConfig(TypedDict, total=False):
    """Known keys for conversation config (JSONB).

    All fields are optional — the config dict may contain a subset of these.
    """

    enabled_agent_ids: list[str]
    enabled_graph_ids: list[str]
    model_id: str
    model_override: bool
    enabled_mcp_servers: list[str]
    enabled_agents: list[str]
    enabled_graphs: list[str]
    supervisor_prompt: str


class ConversationCreate(BaseModel):
    """Conversation creation request."""

    agent_id: str | None = None
    title: str | None = None
    supervisor_mode: bool = False
    config: dict[str, Any] | None = None


class ConversationUpdate(BaseModel):
    """Conversation update request."""

    title: str | None = None
    supervisor_mode: bool | None = None
    config: dict[str, Any] | None = None


class AttachmentResponse(BaseModel):
    """Attachment metadata returned to the client."""

    id: str
    filename: str
    content_type: str | None = None
    size_bytes: int | None = None


class MessageResponse(BaseModel):
    """Message response."""

    id: str
    role: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    attachments: list[AttachmentResponse] = Field(default_factory=list)
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
    config: dict[str, Any] = Field(default_factory=dict)
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
    attachment_ids: list[str] = Field(default_factory=list, max_length=5)


class MemoryEntrySummary(BaseModel):
    """Slim memory entry used during supervisor routing context."""

    id: str
    content: str
    scope: str
    tier: str
    importance: float = 0.5
    memory_type: str = "episodic"
    category: str = ""


class KnowledgeChunkResponse(BaseModel):
    """A single RAG chunk used during retrieval."""

    chunk_id: str
    document_id: str
    collection_id: str
    collection_name: str
    document_filename: str | None = None
    content_preview: str = ""
    score: float = 0.0
    chunk_index: int = 0


class KnowledgeCollectionResponse(BaseModel):
    """A RAG collection queried during retrieval."""

    collection_id: str
    collection_name: str
    chunk_count: int = 0


class KnowledgeDataResponse(BaseModel):
    """RAG knowledge data returned alongside a message."""

    collections: list[KnowledgeCollectionResponse] = Field(default_factory=list)
    chunks: list[KnowledgeChunkResponse] = Field(default_factory=list)
    total_results: int = 0


class EphemeralAgent(BaseModel):
    """Ephemeral agent reference returned in supervisor responses."""

    id: str
    name: str


class ContextHistoryMessage(BaseModel):
    """A single message from the conversation history buffer."""

    role: str
    content: str


class ContextHistoryBudget(BaseModel):
    """Budget info for the conversation history window."""

    included_count: int = 0
    total_chars: int = 0
    max_chars: int = 0
    budget_exceeded: bool = False
    context_window: int | None = None
    history_budget_pct: float | None = None
    history_budget_tokens: int | None = None


class ContextHistory(BaseModel):
    """Conversation history context injected into LLM."""

    budget: ContextHistoryBudget | None = None
    messages: list[ContextHistoryMessage] = Field(default_factory=list)
    summary: str = ""


class BudgetLayerInfo(BaseModel):
    """Token budget info for a single context layer."""

    pct: float = 0
    allocated: int = 0
    used: int = 0


class BudgetOverview(BaseModel):
    """Overall context budget breakdown across all layers."""

    context_window: int = 0
    effective_context: int = 0
    max_pct: float = 100
    layers: dict[str, BudgetLayerInfo] = Field(default_factory=dict)


class ContextData(BaseModel):
    """Full context injection data for frontend display."""

    history: ContextHistory | None = None
    memory_entries: list[MemoryEntrySummary] = Field(default_factory=list)
    budget_overview: BudgetOverview | None = None


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
    ephemeral_agent: EphemeralAgent | None = None
    memory_entries: list[MemoryEntrySummary] = Field(default_factory=list)
    knowledge_data: KnowledgeDataResponse | None = None
    context_data: ContextData | None = None


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


class CompactResponse(BaseModel):
    """Context compaction response."""

    summary_preview: str
    compacted_count: int
    duration_ms: int
