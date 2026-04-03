"""Project API schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = None
    description: str | None = None
    icon: str | None = None
    color: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    is_archived: bool | None = None


class ProjectMemberAdd(BaseModel):
    user_id: str
    role: str = "editor"


class ProjectMemberUpdate(BaseModel):
    role: str


class MemberResponse(BaseModel):
    user_id: str
    email: str
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    icon: str | None
    color: str | None
    owner_user_id: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime | None
    member_count: int = 0

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    members: list[MemberResponse] = Field(default_factory=list)


class ProjectRepoAdd(BaseModel):
    repo_identifier: str = Field(min_length=1, max_length=300)
    repo_url: str | None = None
    display_name: str | None = None


class ProjectRepoResponse(BaseModel):
    id: str
    repo_identifier: str
    repo_url: str | None
    display_name: str | None
    added_at: datetime

    model_config = {"from_attributes": True}


class ResourceCounts(BaseModel):
    conversations: int = 0
    collections: int = 0
    mini_apps: int = 0
    scheduled_tasks: int = 0
    repositories: int = 0
