"""Connector schemas."""

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse


class ConnectorCreate(BaseModel):
    """Connector creation request."""

    name: str = Field(min_length=1, max_length=200)
    connector_type: str = Field(min_length=1, max_length=20)
    agent_id: str | None = None
    graph_id: str | None = None
    supervisor_mode: bool = False
    config: dict = Field(default_factory=dict)


class ConnectorUpdate(BaseModel):
    """Connector update request."""

    name: str | None = None
    agent_id: str | None = None
    graph_id: str | None = None
    supervisor_mode: bool | None = None
    is_enabled: bool | None = None
    config: dict | None = None


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
