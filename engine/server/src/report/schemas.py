"""Report schemas — typed response models for report endpoints."""

from pydantic import BaseModel, Field

# --- /status ---


class StatusResponse(BaseModel):
    uptime_seconds: int
    version: str
    environment: str


# --- /metrics ---


class QueueDepth(BaseModel):
    executions: int = 0
    models: int = 0
    memory_raw: int = 0


class MetricsResponse(BaseModel):
    queue_depth: QueueDepth | None = None
    dead_letter: int | None = None


# --- /models ---


class ModelEntry(BaseModel):
    id: str | None = None
    name: str | None = None
    provider: str | None = None
    available: bool = True


class ModelsResponse(BaseModel):
    total: int
    installed: int
    models: list[ModelEntry]


# --- /pipeline ---


class ConsumerGroupInfo(BaseModel):
    name: str
    pending: int
    consumers: int


class StreamInfo(BaseModel):
    length: int = 0
    groups: list[ConsumerGroupInfo] = Field(default_factory=list)


class PipelineResponse(BaseModel):
    memory_raw: StreamInfo
    memory_extracted: StreamInfo
    tasks_executions: StreamInfo
    tasks_models: StreamInfo
    dlq: StreamInfo
