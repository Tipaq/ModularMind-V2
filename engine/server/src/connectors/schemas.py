"""Connector schemas."""

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse


class ConnectorCreate(BaseModel):
    """Connector creation request."""

    name: str = Field(min_length=1, max_length=200)
    connector_type: str = Field(pattern="^(slack|teams|email|discord)$")
    agent_id: str
    config: dict = Field(default_factory=dict)


class ConnectorUpdate(BaseModel):
    """Connector update request."""

    name: str | None = None
    agent_id: str | None = None
    is_enabled: bool | None = None
    config: dict | None = None


class ConnectorResponse(BaseModel):
    """Connector response (without secret)."""

    id: str
    name: str
    connector_type: str
    agent_id: str
    webhook_url: str
    is_enabled: bool
    config: dict
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class ConnectorCreateResponse(ConnectorResponse):
    """Response after creating a connector — includes the webhook_secret once.

    The secret is only shown at creation time. Subsequent GET/PUT/LIST
    responses use ConnectorResponse which omits it.
    """

    webhook_secret: str


class ConnectorListResponse(PaginatedResponse[ConnectorResponse]):
    """Connector list response."""
