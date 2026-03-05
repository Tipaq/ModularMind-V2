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


class MemoryPipelineData(BaseModel):
    memory_raw: StreamDetail
    memory_extracted: StreamDetail
    memory_scored: StreamDetail | None = None
    memory_dlq: StreamDetail
    scorer_enabled: bool = True
    total_entries: int = 0
    entries_by_tier: dict[str, int] = Field(default_factory=dict)
    entries_by_type: dict[str, int] = Field(default_factory=dict)
    avg_importance: float = 0.0


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
    status_counts: DocumentStatusCounts
    active_documents: list[ActiveDocument] = Field(default_factory=list)


class PipelineCounters(BaseModel):
    facts_extracted_total: int = 0
    embeddings_stored_total: int = 0


class PipelinesResponse(BaseModel):
    memory: MemoryPipelineData
    knowledge: KnowledgePipelineData
    dlq_messages: list[DLQMessage] = Field(default_factory=list)
    counters: PipelineCounters
