"""Setup wizard schemas."""

from pydantic import BaseModel, EmailStr, Field


class SetupStatus(BaseModel):
    """Response for GET /setup/status."""

    initialized: bool
    runtime_mode: str
    version: str


class SetupInitialize(BaseModel):
    """Request for POST /setup/initialize."""

    email: EmailStr
    password: str = Field(min_length=10)
    runtime_name: str = Field(min_length=1, max_length=100)
    default_provider: str = Field(default="ollama", pattern="^(ollama|openai|anthropic)$")


class SetupResponse(BaseModel):
    """Response for POST /setup/initialize."""

    message: str
    email: str
    runtime_name: str
