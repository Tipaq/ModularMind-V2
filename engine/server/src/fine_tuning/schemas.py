"""
Fine-tuning Pydantic schemas.

Request/response models for the fine-tuning API.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse

from .models import (
    CurationStatus,
    DatasetStatus,
    ExperimentStatus,
    JobProvider,
    JobStatus,
)

# ---------------------------------------------------------------------------
# Dataset schemas
# ---------------------------------------------------------------------------


class DatasetFilters(BaseModel):
    """Filters for dataset generation."""

    min_rating: int = Field(default=4, ge=1, le=5)
    status: str | None = Field(default="completed")
    date_from: str | None = None
    date_to: str | None = None
    max_examples: int = Field(default=1000, ge=1, le=50000)
    include_feedback: bool = True
    include_executions: bool = True
    include_conversations: bool = True


class DatasetCreate(BaseModel):
    """Request to create a new dataset."""

    agent_id: str
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    filters: DatasetFilters = Field(default_factory=DatasetFilters)
    format: str = Field(default="openai_chat", pattern=r"^(openai_chat|jsonl_local)$")


class DatasetResponse(BaseModel):
    """Dataset response with all fields."""

    id: str
    agent_id: str
    user_id: str | None
    name: str
    description: str | None
    status: DatasetStatus
    filters: dict
    format: str
    example_count: int
    file_path: str | None
    file_size_bytes: int
    version_hash: str | None
    openai_file_id: str | None
    validation_results: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DatasetListResponse(PaginatedResponse[DatasetResponse]):
    """Paginated dataset list."""


class DatasetProgress(BaseModel):
    """Live progress for a building dataset."""

    status: str
    progress_pct: int = 0
    examples_found: int = 0


# ---------------------------------------------------------------------------
# Job schemas
# ---------------------------------------------------------------------------


class JobHyperparameters(BaseModel):
    """Hyperparameters for fine-tuning."""

    n_epochs: int = Field(default=3, ge=1, le=50)
    learning_rate_multiplier: float = Field(default=1.8, gt=0, le=10.0)
    batch_size: str | int = "auto"
    suffix: str | None = None


class JobCreate(BaseModel):
    """Request to create a fine-tuning job."""

    dataset_id: str
    provider: JobProvider
    base_model: str = Field(min_length=1, max_length=100)
    hyperparameters: JobHyperparameters = Field(default_factory=JobHyperparameters)


class JobResponse(BaseModel):
    """Job response with all fields."""

    id: str
    dataset_id: str
    agent_id: str
    user_id: str | None
    provider: JobProvider
    base_model: str
    status: JobStatus
    stream_task_id: str | None
    openai_job_id: str | None
    openai_model_id: str | None
    hyperparameters: dict
    metrics: dict
    error_message: str | None
    cost_usd: float | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    progress: JobProgress | None = None

    model_config = {"from_attributes": True}


class JobListResponse(PaginatedResponse[JobResponse]):
    """Paginated job list."""


class JobProgress(BaseModel):
    """Live progress for a running job."""

    status: str
    progress_pct: int = 0
    current_step: str = ""
    loss: float | None = None
    estimated_remaining_minutes: int | None = None


# ---------------------------------------------------------------------------
# Curation schemas
# ---------------------------------------------------------------------------


class ExampleResponse(BaseModel):
    """Curation example response."""

    id: str
    dataset_id: str
    source_type: str
    source_id: str
    messages: dict
    curation_status: CurationStatus
    curated_by: str | None
    curated_at: datetime | None
    token_count: int
    quality_score: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExampleCurationUpdate(BaseModel):
    """Update a single example's curation status or content."""

    curation_status: CurationStatus | None = None
    messages: dict | None = None  # Allow editing the training example


class BulkCurationUpdate(BaseModel):
    """Bulk update curation status for multiple examples."""

    example_ids: list[str] = Field(min_length=1, max_length=1000)
    curation_status: CurationStatus


# ---------------------------------------------------------------------------
# Experiment schemas
# ---------------------------------------------------------------------------


class ExperimentCreate(BaseModel):
    """Request to create an A/B test experiment."""

    agent_id: str
    name: str = Field(min_length=1, max_length=255)
    control_model_id: str = Field(min_length=1, max_length=200)
    treatment_model_id: str = Field(min_length=1, max_length=200)
    traffic_split: float = Field(default=0.5, ge=0.0, le=1.0)
    min_sample_size: int = Field(default=100, ge=10, le=100000)


class ExperimentResponse(BaseModel):
    """Experiment response with metrics."""

    id: str
    agent_id: str
    user_id: str | None
    name: str
    status: ExperimentStatus
    control_model_id: str
    treatment_model_id: str
    traffic_split: float
    control_executions: int
    treatment_executions: int
    control_metrics: dict
    treatment_metrics: dict
    min_sample_size: int
    statistical_significance: dict | None = None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExperimentListResponse(PaginatedResponse[ExperimentResponse]):
    """Paginated experiment list."""


# ---------------------------------------------------------------------------
# Cost estimation schemas
# ---------------------------------------------------------------------------


class EstimateCostRequest(BaseModel):
    """Request to estimate fine-tuning cost."""

    dataset_id: str
    base_model: str
    n_epochs: int = Field(default=3, ge=1, le=50)


class EstimateCostResponse(BaseModel):
    """Cost estimation response."""

    estimated_cost_usd: float
    total_tokens: int
    epochs: int
    price_per_1m_tokens: float


# ---------------------------------------------------------------------------
# Auto-retrain config schemas
# ---------------------------------------------------------------------------


class AgentFineTuningConfigUpdate(BaseModel):
    """Update per-agent fine-tuning settings."""

    auto_retrain_enabled: bool | None = None
    auto_retrain_threshold: int | None = Field(default=None, ge=10, le=10000)
    default_base_model: str | None = None
    default_provider: str | None = None


class AgentFineTuningConfigResponse(BaseModel):
    """Per-agent fine-tuning config response."""

    agent_id: str
    auto_retrain_enabled: bool
    auto_retrain_threshold: int
    default_base_model: str | None
    default_provider: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
