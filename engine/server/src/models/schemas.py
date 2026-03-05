"""Model management schemas."""

from pydantic import BaseModel


class ModelResponse(BaseModel):
    """Runtime model information."""

    id: str
    name: str
    provider: str
    model_id: str
    display_name: str | None = None
    model_type: str = "local"
    context_window: int | None = None
    max_output_tokens: int | None = None
    parameter_size: str | None = None
    disk_size: str | None = None
    quantization: str | None = None
    family: str | None = None
    is_required: bool = False
    is_active: bool = True
    is_available: bool = False
    is_embedding: bool = False
    pull_progress: dict[str, str] | None = None
    model_metadata: dict = {}


class PullRequest(BaseModel):
    model_name: str
    display_name: str | None = None
    parameter_size: str | None = None
    disk_size: str | None = None
    context_window: int | None = None
    max_output_tokens: int | None = None


class PullResponse(BaseModel):
    task_id: str
    model_name: str
    status: str
