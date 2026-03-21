"""Pydantic request/response models for mini-apps API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse

from .models import MiniAppScope


class MiniAppCreate(BaseModel):
    """Mini-app creation request."""

    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100)
    description: str = ""
    scope: MiniAppScope = MiniAppScope.PERSONAL
    allowed_groups: list[str] = Field(default_factory=list)
    owner_user_id: str | None = None
    agent_id: str | None = None
    initial_html: str | None = None


class MiniAppUpdate(BaseModel):
    """Mini-app metadata update request."""

    name: str | None = None
    description: str | None = None
    icon: str | None = None
    is_active: bool | None = None
    scope: MiniAppScope | None = None
    allowed_groups: list[str] | None = None


class MiniAppFileResponse(BaseModel):
    """Mini-app file metadata."""

    id: str
    path: str
    size_bytes: int
    content_type: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class MiniAppResponse(BaseModel):
    """Mini-app response."""

    id: str
    name: str
    slug: str
    description: str
    icon: str | None
    entry_file: str
    version: int
    is_active: bool
    scope: str
    allowed_groups: list[str] = Field(default_factory=list)
    owner_user_id: str | None
    agent_id: str | None
    created_at: datetime
    updated_at: datetime
    files: list[MiniAppFileResponse] | None = None

    model_config = {"from_attributes": True}


class MiniAppListResponse(PaginatedResponse[MiniAppResponse]):
    """Paginated mini-app list."""


class MiniAppFileWrite(BaseModel):
    """File write request."""

    path: str = Field(min_length=1, max_length=500)
    content: str
    content_type: str = "text/plain"


class FileWriteResponse(BaseModel):
    """File write result."""

    path: str
    size: int


class FileReadResponse(BaseModel):
    """File content response."""

    content: str
    content_type: str


class StorageSetRequest(BaseModel):
    """Storage value set request."""

    value: Any


class StorageKeyResponse(BaseModel):
    """Storage key metadata."""

    key: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class StorageValueResponse(BaseModel):
    """Storage key with value."""

    key: str
    value: Any
    updated_at: datetime

    model_config = {"from_attributes": True}


class SnapshotResponse(BaseModel):
    """Snapshot metadata."""

    id: str
    version: int
    label: str | None
    file_manifest: list[dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}


class RollbackResponse(BaseModel):
    """Rollback result."""

    restored: int
