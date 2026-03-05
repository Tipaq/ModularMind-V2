"""
Memory schemas.

Pydantic models for memory API requests and responses.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse

from .models import MemoryScope, MemoryTier, MemoryType


class MemoryEntryResponse(BaseModel):
    """Memory entry response."""

    id: str
    scope: MemoryScope
    scope_id: str
    tier: MemoryTier
    memory_type: MemoryType
    content: str
    importance: float
    access_count: int
    last_accessed: datetime | None
    expired_at: datetime | None
    metadata: dict = Field(validation_alias="meta")
    user_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class MemoryListResponse(PaginatedResponse[MemoryEntryResponse]):
    """Memory list response."""


class MemorySearchRequest(BaseModel):
    """Memory search request."""

    query: str = Field(min_length=1, max_length=1000)
    scope: MemoryScope
    scope_id: str
    limit: int = Field(default=10, ge=1, le=50)
    threshold: float = Field(default=0.7, ge=0, le=1)


class MemorySearchResult(BaseModel):
    """Memory search result."""

    entry: MemoryEntryResponse
    score: float


class MemorySearchResponse(BaseModel):
    """Memory search response."""

    results: list[MemorySearchResult]
    query_embedding_cached: bool = False
    warning: str | None = None


class MemoryStatsResponse(BaseModel):
    """Memory stats response."""

    total_entries: int
    entries_by_tier: dict[str, int]
    entries_by_type: dict[str, int]
    oldest_entry: datetime | None
    newest_entry: datetime | None


class GlobalMemoryStatsResponse(BaseModel):
    """Global memory stats for Ops dashboard."""

    total_entries: int
    entries_by_type: dict[str, int]
    entries_by_tier: dict[str, int]
    entries_by_scope: dict[str, int]
    avg_importance: float
    total_accesses: int
    last_consolidation: datetime | None
    entries_decayed_last_cycle: int


class ConsolidationTriggerResponse(BaseModel):
    """Response after triggering manual consolidation."""

    status: str
    decayed: int
    invalidated: int
    scopes_processed: int
    logs_cleaned: int
    duration_ms: int


class ConsolidationLogResponse(BaseModel):
    """Consolidation log entry response."""

    id: str
    scope: str
    scope_id: str
    action: str
    source_entry_ids: list
    result_entry_id: str | None
    details: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class GraphNodeResponse(BaseModel):
    """Graph node for visualization."""

    id: str
    content: str
    memory_type: str
    scope: str
    scope_id: str
    tier: str
    importance: float
    access_count: int
    entities: list
    tags: list
    user_id: str | None
    last_accessed: datetime | None
    created_at: datetime


class GraphEdgeResponse(BaseModel):
    """Graph edge for visualization."""

    source: str
    target: str
    edge_type: str
    weight: float
    shared_entities: list


class GraphResponse(BaseModel):
    """Graph data for visualization."""

    nodes: list[GraphNodeResponse]
    edges: list[GraphEdgeResponse]


class MemoryUserResponse(BaseModel):
    """User with memory count."""

    user_id: str
    email: str | None
    memory_count: int


# ── Memory Config ──────────────────────────────────────────────────


class MemoryConfigResponse(BaseModel):
    """Current memory configuration values."""

    # Decay
    decay_episodic_half_life: int
    decay_semantic_half_life: int
    decay_procedural_half_life: int
    decay_prune_threshold: float

    # Scoring weights
    score_weight_recency: float
    score_weight_importance: float
    score_weight_relevance: float
    score_weight_frequency: float
    min_relevance_gate: float

    # Extraction
    extraction_batch_size: int
    extraction_idle_seconds: int
    extraction_scan_interval: int
    buffer_token_threshold: int

    # General
    max_entries: int
    fact_extraction_enabled: bool
    fact_extraction_min_messages: int
    scorer_enabled: bool
    scorer_min_importance: float

    # Context budget
    context_budget_history_pct: float
    context_budget_memory_pct: float
    context_budget_rag_pct: float
    context_budget_default_context_window: int
    context_budget_max_pct: float
    conversation_history_max_messages: int


class MemoryConfigUpdate(BaseModel):
    """Partial update for memory configuration."""

    # Decay
    decay_episodic_half_life: int | None = Field(default=None, ge=1)
    decay_semantic_half_life: int | None = Field(default=None, ge=1)
    decay_procedural_half_life: int | None = Field(default=None, ge=1)
    decay_prune_threshold: float | None = Field(default=None, ge=0.0, le=1.0)

    # Scoring weights
    score_weight_recency: float | None = Field(default=None, ge=0.0, le=1.0)
    score_weight_importance: float | None = Field(default=None, ge=0.0, le=1.0)
    score_weight_relevance: float | None = Field(default=None, ge=0.0, le=1.0)
    score_weight_frequency: float | None = Field(default=None, ge=0.0, le=1.0)
    min_relevance_gate: float | None = Field(default=None, ge=0.0, le=1.0)

    # Extraction
    extraction_batch_size: int | None = Field(default=None, ge=5, le=100)
    extraction_idle_seconds: int | None = Field(default=None, ge=60, le=3600)
    extraction_scan_interval: int | None = Field(default=None, ge=30, le=600)
    buffer_token_threshold: int | None = Field(default=None, ge=500, le=20000)

    # General
    max_entries: int | None = Field(default=None, ge=100, le=10000)
    fact_extraction_enabled: bool | None = None
    fact_extraction_min_messages: int | None = Field(default=None, ge=1, le=100)
    scorer_enabled: bool | None = None
    scorer_min_importance: float | None = Field(default=None, ge=0.0, le=1.0)

    # Context budget
    context_budget_history_pct: float | None = Field(default=None, ge=5.0, le=60.0)
    context_budget_memory_pct: float | None = Field(default=None, ge=0.0, le=30.0)
    context_budget_rag_pct: float | None = Field(default=None, ge=0.0, le=40.0)
    context_budget_default_context_window: int | None = Field(default=None, ge=2048, le=200000)
    context_budget_max_pct: float | None = Field(default=None, ge=10.0, le=100.0)
    conversation_history_max_messages: int | None = Field(default=None, ge=5, le=50)
