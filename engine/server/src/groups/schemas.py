"""Group API schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    """Request body to create a group."""

    name: str = Field(min_length=1, max_length=100)
    slug: str | None = None  # Auto-generated from name if not provided
    description: str | None = None


class GroupUpdate(BaseModel):
    """Request body to update a group."""

    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class MemberAdd(BaseModel):
    """Request body to add a member to a group."""

    user_id: str
    role: str = "member"  # "owner" | "admin" | "member"


class MemberResponse(BaseModel):
    """A member in a group."""

    user_id: str
    email: str
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class GroupResponse(BaseModel):
    """Group response."""

    id: str
    name: str
    slug: str
    description: str | None
    is_active: bool
    created_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class GroupDetailResponse(GroupResponse):
    """Group response with members."""

    members: list[MemberResponse] = Field(default_factory=list)
