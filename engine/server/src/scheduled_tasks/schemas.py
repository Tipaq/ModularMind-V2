"""Pydantic schemas for scheduled task API."""

from datetime import datetime, timedelta
from typing import Any

from pydantic import BaseModel, Field, field_validator

VALID_SCHEDULE_TYPES = {"interval", "one_shot", "manual"}
VALID_INTERVAL_UNITS = {"minutes", "hours", "days"}
VALID_TARGET_TYPES = {"agent", "graph"}


def _coerce_version(v: Any) -> int:
    if isinstance(v, str):
        return int(v) if v.isdigit() else 1
    return int(v) if v else 1


def interval_to_seconds(value: int, unit: str) -> int:
    """Convert interval value + unit to seconds."""
    multipliers = {"minutes": 60, "hours": 3600, "days": 86400}
    return value * multipliers.get(unit, 3600)


def _parse_anchor_time(start_at: str) -> tuple[int, int]:
    """Parse 'HH:MM' string into (hour, minute) tuple."""
    parts = start_at.split(":")
    return int(parts[0]), int(parts[1])


def _compute_anchored_next_run(
    interval_value: int,
    interval_unit: str,
    start_at: str,
) -> datetime:
    """Compute next run aligned to anchor time (start_at='HH:MM')."""
    now = datetime.utcnow()
    hour, minute = _parse_anchor_time(start_at)

    if interval_unit == "days":
        candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        interval_delta = timedelta(days=interval_value)
    elif interval_unit == "hours":
        candidate = now.replace(minute=minute, second=0, microsecond=0)
        interval_delta = timedelta(hours=interval_value)
    else:
        return now + timedelta(seconds=interval_to_seconds(interval_value, interval_unit))

    if candidate <= now:
        candidate += interval_delta
    return candidate


def compute_next_run_at(
    schedule_type: str,
    interval_value: int | None,
    interval_unit: str | None,
    scheduled_at: datetime | None,
    start_at: str | None = None,
) -> datetime | None:
    """Compute next run time based on schedule configuration."""
    if schedule_type == "one_shot" and scheduled_at:
        return scheduled_at
    if schedule_type == "interval" and interval_value and interval_unit:
        if start_at:
            return _compute_anchored_next_run(interval_value, interval_unit, start_at)
        seconds = interval_to_seconds(interval_value, interval_unit)
        return datetime.utcnow() + timedelta(seconds=seconds)
    return None


class ScheduledTaskConfig(BaseModel):
    """Full scheduled task configuration (stored in engine DB)."""

    id: str
    name: str = ""
    description: str = ""
    enabled: bool = False
    schedule_type: str = "manual"
    interval_value: int | None = None
    interval_unit: str | None = None
    scheduled_at: datetime | None = None
    start_at: str | None = None
    target_type: str = "agent"
    target_id: str | None = None
    input_text: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    tags: list[str] = Field(default_factory=list)

    @field_validator("version", mode="before")
    @classmethod
    def coerce_version(cls, v: Any) -> int:
        return _coerce_version(v)


class ScheduledTaskCreate(BaseModel):
    name: str
    description: str = ""
    enabled: bool = False
    schedule_type: str = "manual"
    interval_value: int | None = None
    interval_unit: str | None = None
    scheduled_at: datetime | None = None
    start_at: str | None = None
    target_type: str = "agent"
    target_id: str | None = None
    input_text: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)

    @field_validator("schedule_type")
    @classmethod
    def validate_schedule_type(cls, v: str) -> str:
        if v not in VALID_SCHEDULE_TYPES:
            raise ValueError(f"schedule_type must be one of {VALID_SCHEDULE_TYPES}")
        return v

    @field_validator("interval_unit")
    @classmethod
    def validate_interval_unit(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_INTERVAL_UNITS:
            raise ValueError(f"interval_unit must be one of {VALID_INTERVAL_UNITS}")
        return v

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        if v not in VALID_TARGET_TYPES:
            raise ValueError(f"target_type must be one of {VALID_TARGET_TYPES}")
        return v


class ScheduledTaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    schedule_type: str | None = None
    interval_value: int | None = None
    interval_unit: str | None = None
    scheduled_at: datetime | None = None
    start_at: str | None = None
    target_type: str | None = None
    target_id: str | None = None
    input_text: str | None = None
    config: dict[str, Any] | None = None
    tags: list[str] | None = None


class ScheduledTaskResponse(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool
    schedule_type: str
    interval_value: int | None
    interval_unit: str | None
    scheduled_at: datetime | None
    start_at: str | None
    next_run_at: datetime | None
    last_run_at: datetime | None
    target_type: str
    target_id: str | None
    input_text: str
    config: dict[str, Any]
    version: int
    tags: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ScheduledTaskRunResponse(BaseModel):
    id: str
    scheduled_task_id: str | None
    status: str
    source_type: str
    source_ref: str
    execution_id: str | None
    result_summary: str
    error_message: str
    duration_seconds: float | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
