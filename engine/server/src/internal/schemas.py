"""Internal monitoring and pipeline schemas."""

from datetime import datetime

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Monitoring Schemas
# ---------------------------------------------------------------------------


class GPUInfoResponse(BaseModel):
    available: bool
    type: str
    device_count: int
    memory_gb: float


class SystemMonitoring(BaseModel):
    cpu_percent: float
    cpu_count: int
    cpu_count_logical: int
    memory_total_gb: float
    memory_used_gb: float
    memory_percent: float
    disk_total_gb: float
    disk_used_gb: float
    disk_percent: float
    gpu: GPUInfoResponse


class StreamingMonitoring(BaseModel):
    """SSE streaming status."""

    active_streams: int = 0


class SchedulerMonitoring(BaseModel):
    global_current: int
    global_max: int
    active_slots: int
    backpressure: bool


class InfraMonitoring(BaseModel):
    db_pool_size: int
    db_pool_max_overflow: int
    redis_max_connections: int
    redis_healthy: bool
    redis_latency_ms: float | None
    ollama_status: str
    ollama_models: list[str]
    ollama_running_models: list[str] = Field(default_factory=list)
    qdrant_status: str = "unknown"
    qdrant_latency_ms: float | None = None
    qdrant_collections: int = 0


class AlertItem(BaseModel):
    id: str
    metric: str
    threshold: float
    actual: float
    message: str
    severity: str
    triggered_at: str


class AlertSummary(BaseModel):
    active_count: int = 0
    active_alerts: list[AlertItem] = Field(default_factory=list)


class MonitoringResponse(BaseModel):
    timestamp: str
    uptime_seconds: int
    system: SystemMonitoring
    worker: dict = {}
    streaming: StreamingMonitoring
    scheduler: SchedulerMonitoring
    infrastructure: InfraMonitoring
    alerts: AlertSummary = Field(default_factory=AlertSummary)


class MetricPoint(BaseModel):
    ts: float
    value: dict


class MetricSeries(BaseModel):
    name: str
    points: list[MetricPoint]


class MetricsHistoryResponse(BaseModel):
    series: list[MetricSeries]
    range_seconds: int
    interval_seconds: int


class OllamaRunningModel(BaseModel):
    name: str
    size_vram_bytes: int
    size_vram_gb: float
    expires_at: str | None
    context_length: int
    parameter_size: str
    quantization: str
    family: str


# ---------------------------------------------------------------------------
# Pipeline Schemas
# ---------------------------------------------------------------------------


class StreamGroupInfo(BaseModel):
    name: str
    pending: int
    consumers: int


class StreamDetail(BaseModel):
    length: int
    groups: list[StreamGroupInfo] = Field(default_factory=list)


class DLQMessage(BaseModel):
    id: str
    original_stream: str
    original_id: str
    error: str
    data: str


class DocumentStatusCounts(BaseModel):
    pending: int = 0
    processing: int = 0
    ready: int = 0
    failed: int = 0
    total: int = 0


class ActiveDocument(BaseModel):
    id: str
    filename: str
    collection_id: str
    collection_name: str
    status: str
    error_message: str | None = None
    size_bytes: int | None = None
    created_at: datetime


class KnowledgePipelineData(BaseModel):
    documents_stream: StreamDetail
    dlq_stream: StreamDetail | None = None
    status_counts: DocumentStatusCounts
    active_documents: list[ActiveDocument] = Field(default_factory=list)


class PipelineCounters(BaseModel):
    total_chunks: int = 0
    total_chunk_accesses: int = 0


class PipelinesResponse(BaseModel):
    knowledge: KnowledgePipelineData
    dlq_messages: list[DLQMessage] = Field(default_factory=list)
    counters: PipelineCounters


# ---------------------------------------------------------------------------
# User Sync Schemas
# ---------------------------------------------------------------------------


class UserSyncItem(BaseModel):
    """A single user from the platform sync payload."""

    id: str
    email: str
    hashed_password: str
    role: str
    is_active: bool


class UserSyncRequest(BaseModel):
    """Request body for user sync from platform."""

    users: list[UserSyncItem]


# ---------------------------------------------------------------------------
# Alerts Schemas
# ---------------------------------------------------------------------------


class ThresholdConfig(BaseModel):
    cpu_percent: float = 90.0
    memory_percent: float = 85.0
    workers_min: int = 1
    dlq_max: int = 10
    queue_depth_max: int = 50
    enabled: bool = True


class ThresholdUpdate(BaseModel):
    cpu_percent: float | None = None
    memory_percent: float | None = None
    workers_min: int | None = None
    dlq_max: int | None = None
    queue_depth_max: int | None = None
    enabled: bool | None = None


class AlertHistoryResponse(BaseModel):
    items: list[AlertItem]
    total: int


class ActiveAlertsResponse(BaseModel):
    active_count: int
    alerts: list[AlertItem]


# ---------------------------------------------------------------------------
# Monitoring Schemas (LLM / GPU)
# ---------------------------------------------------------------------------


class GpuVramMonitoring(BaseModel):
    total_vram_gb: float
    used_vram_gb: float
    used_vram_percent: float
    loaded_models: list[OllamaRunningModel]
    model_count: int


class LlmPerformanceSnapshot(BaseModel):
    avg_latency_ms: float
    avg_tokens_per_second: float
    avg_ttft_ms: float
    total_requests_last_hour: int


class ModelEvent(BaseModel):
    type: str
    model: str
    ts: str


class LlmGpuMonitoring(BaseModel):
    gpu_vram: GpuVramMonitoring
    llm_performance: LlmPerformanceSnapshot
    model_events: list[ModelEvent]


class AgentMetricsItem(BaseModel):
    agent_id: str
    agent_name: str
    total_executions: int
    total_tokens: int
    avg_duration_ms: float
    error_count: int
    error_rate: float


class ExecutionSummary(BaseModel):
    id: str
    execution_type: str
    status: str
    user_id: str
    user_email: str
    agent_id: str | None
    graph_id: str | None
    model: str | None
    tokens_prompt: int
    tokens_completion: int
    input_preview: str
    started_at: str | None
    created_at: str
    completed_at: str | None
    duration_seconds: float | None


class LiveExecutionsResponse(BaseModel):
    active: list[ExecutionSummary]
    recent: list[ExecutionSummary]
    total_active: int


# ---------------------------------------------------------------------------
# Playground Schemas
# ---------------------------------------------------------------------------


class PlaygroundMessage(BaseModel):
    role: str
    content: str


class PlaygroundCompletionRequest(BaseModel):
    provider: str
    model: str
    messages: list[PlaygroundMessage]
    max_tokens: int = 1024
    temperature: float = 0.7


class PlaygroundCompletionResponseBody(BaseModel):
    content: str
    model: str
    usage: dict[str, int]
    latency_ms: int


# ---------------------------------------------------------------------------
# Providers Schemas
# ---------------------------------------------------------------------------


class ProviderTestRequest(BaseModel):
    provider: str
    api_key: str | None = None
    base_url: str | None = None


class ProviderTestResponse(BaseModel):
    provider: str
    available: bool
    error: str | None = None


class InternalPullRequest(BaseModel):
    model_name: str


# ---------------------------------------------------------------------------
# Settings Schemas
# ---------------------------------------------------------------------------


class SettingsResponse(BaseModel):
    llm_api_keys: dict[str, str]
    default_model: str | None
    ollama_keep_alive: str
    ollama_enabled: bool
    ollama_gpu_mode: bool
    ollama_running: bool
    max_execution_timeout: int
    knowledge_embedding_provider: str
    knowledge_embedding_model: str


class SettingsUpdate(BaseModel):
    llm_api_keys: dict[str, str] | None = Field(None, max_length=20)
    default_model: str | None = None
    ollama_keep_alive: str | None = None
    max_execution_timeout: int | None = Field(None, ge=60, le=1800)
    knowledge_embedding_provider: str | None = None
    knowledge_embedding_model: str | None = None


# ---------------------------------------------------------------------------
# Supervisor Layers Schemas
# ---------------------------------------------------------------------------


class LayerInfo(BaseModel):
    key: str
    label: str
    description: str
    content: str
    filename: str


class LayersResponse(BaseModel):
    layers: list[LayerInfo]


class LayerUpdateRequest(BaseModel):
    content: str = Field(..., min_length=0, max_length=10000)


class LayerUpdateResponse(BaseModel):
    key: str
    content: str
    status: str = "updated"


# ---------------------------------------------------------------------------
# Logs Schemas
# ---------------------------------------------------------------------------


class LogEntry(BaseModel):
    ts: str
    level: str
    logger: str
    message: str
    source: str


class LogsResponse(BaseModel):
    items: list[LogEntry]
    total: int
