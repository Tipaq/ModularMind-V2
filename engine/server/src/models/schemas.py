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


# ---------------------------------------------------------------------------
# Usage router schemas
# ---------------------------------------------------------------------------


class CatalogModelResponse(BaseModel):
    id: str
    provider: str
    model_name: str
    display_name: str
    model_type: str = "local"
    context_window: int | None = None
    max_output_tokens: int | None = None
    family: str | None = None
    size: str | None = None
    disk_size: str | None = None
    quantization: str | None = None
    capabilities: dict[str, bool] = {}
    is_required: bool = False
    is_enabled: bool = True
    is_global: bool = True
    pull_status: str | None = None
    pull_progress: int | None = None
    pull_error: str | None = None
    model_metadata: dict = {}
    created_at: str = ""
    updated_at: str = ""


class PaginatedCatalogResponse(BaseModel):
    models: list[CatalogModelResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ProviderConfigResponse(BaseModel):
    provider: str
    name: str
    api_key: str | None = None
    base_url: str | None = None
    is_configured: bool = False
    is_connected: bool = False
    last_tested_at: str | None = None


class BrowsableModelResponse(BaseModel):
    provider: str
    model_name: str
    display_name: str
    context_window: int | None = None
    max_output_tokens: int | None = None
    size: str | None = None
    disk_size: str | None = None
    family: str | None = None
    capabilities: dict[str, bool] = {}
    model_type: str = "local"
    source: str = "curated"
