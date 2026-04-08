"""Connector schemas."""

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse


class ConnectorCreate(BaseModel):
    """Connector creation request."""

    name: str = Field(min_length=1, max_length=200)
    connector_type: str = Field(min_length=1, max_length=60)
    agent_id: str | None = None
    graph_id: str | None = None
    supervisor_mode: bool = False
    config: dict = Field(default_factory=dict)
    project_id: str | None = None
    spec: dict | None = None


class ConnectorUpdate(BaseModel):
    """Connector update request."""

    name: str | None = None
    agent_id: str | None = None
    graph_id: str | None = None
    supervisor_mode: bool | None = None
    is_enabled: bool | None = None
    config: dict | None = None
    spec: dict | None = None


class ConnectorResponse(BaseModel):
    """Connector response (without secret)."""

    id: str
    name: str
    connector_type: str
    agent_id: str | None = None
    graph_id: str | None = None
    supervisor_mode: bool = False
    webhook_url: str
    is_enabled: bool
    config: dict
    scope: str
    user_id: str | None = None
    project_id: str | None = None
    has_spec: bool = False
    credential_count: int = 0
    has_user_credential: bool = False
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class ConnectorCreateResponse(ConnectorResponse):
    """Response after creating a connector — includes the webhook_secret once."""

    webhook_secret: str


class ConnectorListResponse(PaginatedResponse[ConnectorResponse]):
    """Connector list response."""


class ConnectorFieldDefResponse(BaseModel):
    """Field definition for connector configuration UI."""

    key: str
    label: str
    placeholder: str
    is_secret: bool
    is_required: bool


class ConnectorTypeResponse(BaseModel):
    """Metadata for a connector type — used by frontend to render forms dynamically."""

    type_id: str
    name: str
    icon: str
    color: str
    description: str
    doc_url: str
    setup_steps: list[str]
    fields: list[ConnectorFieldDefResponse]


class ConnectorTypesListResponse(BaseModel):
    """Response for GET /connectors/types."""

    items: list[ConnectorTypeResponse]


class CredentialCreate(BaseModel):
    """Request to add a credential to a connector."""

    credential_type: str = Field(min_length=1, max_length=30)
    label: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1)
    refresh_token: str | None = None
    provider: str | None = None
    scopes: list[str] | None = None


class CredentialTestRequest(BaseModel):
    """Request to test credentials before saving."""

    connector_type: str = Field(min_length=1, max_length=60)
    fields: dict[str, str] = Field(default_factory=dict)


class CredentialTestResponse(BaseModel):
    """Result of a credential test."""

    success: bool
    message: str


class CredentialResponse(BaseModel):
    """Credential response (value redacted)."""

    id: str
    connector_id: str
    user_id: str | None = None
    credential_type: str
    label: str
    provider: str | None = None
    scopes: list[str] | None = None
    is_valid: bool
    is_shared: bool
    created_at: str
    updated_at: str
