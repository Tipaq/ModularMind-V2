"""
Fine-tuning models.

SQLAlchemy models for fine-tuning datasets, jobs, curation, A/B experiments,
and per-agent fine-tuning configuration.
"""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Enum as _SQLEnum
from sqlalchemy import ForeignKey, Index, String, Text


def SQLEnum(enum_class, **kwargs):
    """SQLEnum wrapper that uses enum .value (lowercase) for DB storage."""
    kwargs.setdefault("values_callable", lambda x: [e.value for e in x])
    return _SQLEnum(enum_class, **kwargs)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infra.database import Base
from src.infra.utils import utcnow


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class DatasetStatus(str, Enum):
    """Dataset build lifecycle."""

    BUILDING = "building"
    READY = "ready"
    UPLOADED = "uploaded"
    ERROR = "error"


class JobStatus(str, Enum):
    """Fine-tuning job lifecycle."""

    PENDING = "pending"
    VALIDATING = "validating"
    TRAINING = "training"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobProvider(str, Enum):
    """Supported fine-tuning providers."""

    OPENAI = "openai"
    LOCAL_EXPORT = "local_export"


class CurationStatus(str, Enum):
    """Manual curation status for individual examples."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ExperimentStatus(str, Enum):
    """A/B test experiment lifecycle."""

    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class FineTuningDataset(Base):
    """A fine-tuning dataset built from agent execution data."""

    __tablename__ = "fine_tuning_datasets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    agent_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[DatasetStatus] = mapped_column(
        SQLEnum(DatasetStatus), default=DatasetStatus.BUILDING
    )
    # Filters used to generate this dataset
    # {min_rating: 4, status: "completed", date_from: "2026-01-01", max_examples: 1000}
    filters: Mapped[dict] = mapped_column(JSONB, default=dict)
    format: Mapped[str] = mapped_column(
        String(20), default="openai_chat"
    )  # openai_chat | jsonl_local
    example_count: Mapped[int] = mapped_column(default=0)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(default=0)
    version_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )  # SHA-256 of content
    openai_file_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # After upload to OpenAI
    # {total: 500, valid: 495, invalid: 5, warnings: [...],
    #  token_stats: {avg: 200, max: 1500, total: 100000}}
    validation_results: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    # Relationships
    examples: Mapped[list["DatasetExample"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )
    jobs: Mapped[list["FineTuningJob"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )


class FineTuningJob(Base):
    """A fine-tuning job (OpenAI API or local export)."""

    __tablename__ = "fine_tuning_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    dataset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("fine_tuning_datasets.id"), nullable=False, index=True
    )
    agent_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    provider: Mapped[JobProvider] = mapped_column(
        SQLEnum(JobProvider), nullable=False
    )
    base_model: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # e.g., "gpt-4o-mini"
    status: Mapped[JobStatus] = mapped_column(
        SQLEnum(JobStatus), default=JobStatus.PENDING
    )
    stream_task_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    # OpenAI-specific
    openai_job_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    openai_model_id: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )  # ft:gpt-4o-mini:org::abc
    # Hyperparameters
    # {n_epochs: 3, learning_rate_multiplier: 1.8, batch_size: "auto", suffix: "my-agent"}
    hyperparameters: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Training metrics
    # {training_loss: 0.12, validation_loss: 0.15, trained_tokens: 50000, epochs_completed: 3}
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    # Relationships
    dataset: Mapped["FineTuningDataset"] = relationship(
        back_populates="jobs", lazy="selectin"
    )


class DatasetExample(Base):
    """A single training example within a dataset (for manual curation)."""

    __tablename__ = "dataset_examples"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    dataset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("fine_tuning_datasets.id"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "feedback" | "execution" | "conversation"
    source_id: Mapped[str] = mapped_column(
        String(36), nullable=False
    )  # Reference to source record
    # {"messages": [{"role": "system", "content": "..."}, ...]}
    messages: Mapped[dict] = mapped_column(JSONB, nullable=False)
    curation_status: Mapped[CurationStatus] = mapped_column(
        SQLEnum(CurationStatus), default=CurationStatus.PENDING
    )
    curated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    curated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    token_count: Mapped[int] = mapped_column(default=0)
    quality_score: Mapped[float | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    # Relationships
    dataset: Mapped["FineTuningDataset"] = relationship(
        back_populates="examples"
    )

    __table_args__ = (
        Index("ix_dataset_examples_curation", "dataset_id", "curation_status"),
    )


class ABTestExperiment(Base):
    """An A/B test experiment comparing base vs fine-tuned model."""

    __tablename__ = "ab_test_experiments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    agent_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[ExperimentStatus] = mapped_column(
        SQLEnum(ExperimentStatus), default=ExperimentStatus.DRAFT
    )
    # Variant configuration
    control_model_id: Mapped[str] = mapped_column(
        String(200), nullable=False
    )  # Base model
    treatment_model_id: Mapped[str] = mapped_column(
        String(200), nullable=False
    )  # Fine-tuned model
    traffic_split: Mapped[float] = mapped_column(
        default=0.5
    )  # 0.0-1.0, fraction sent to treatment
    # Results
    control_executions: Mapped[int] = mapped_column(default=0)
    treatment_executions: Mapped[int] = mapped_column(default=0)
    # {avg_latency_ms, avg_tokens, avg_rating, error_rate, total_cost_usd}
    control_metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    treatment_metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    min_sample_size: Mapped[int] = mapped_column(default=100)
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class AgentFineTuningConfig(Base):
    """Per-agent fine-tuning settings (auto-retrain opt-in, thresholds)."""

    __tablename__ = "agent_fine_tuning_configs"

    agent_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    auto_retrain_enabled: Mapped[bool] = mapped_column(default=False)
    auto_retrain_threshold: Mapped[int] = mapped_column(default=100)
    default_base_model: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # e.g., "gpt-4o-mini"
    default_provider: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # "openai" | "local_export"
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
