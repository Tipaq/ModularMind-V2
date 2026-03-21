"""Pydantic schemas for scheduled task API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


def _coerce_version(v: Any) -> int:
    if isinstance(v, str):
        return int(v) if v.isdigit() else 1
    return int(v) if v else 1


class ScheduledTaskConfig(BaseModel):
    """Full scheduled task configuration (stored in engine DB)."""

    id: str
    name: str = ""
    description: str = ""
    enabled: bool = False
    trigger: dict[str, Any] = Field(default_factory=dict)
    triage: dict[str, Any] | None = None
    execution: dict[str, Any] = Field(default_factory=dict)
    post_actions: list[dict[str, Any]] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    tags: list[str] = Field(default_factory=list)

    @field_validator("version", mode="before")
    @classmethod
    def coerce_version(cls, v: Any) -> int:
        return _coerce_version(v)


class ScheduledTaskCreate(BaseModel):
    name: str
    description: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class ScheduledTaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    config: dict[str, Any] | None = None
    tags: list[str] | None = None


class ScheduledTaskResponse(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool
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
