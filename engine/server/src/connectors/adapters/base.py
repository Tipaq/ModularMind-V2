"""Abstract base class for platform adapters."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from fastapi import Request
from fastapi.responses import JSONResponse

from src.connectors.models import Connector


@dataclass
class ExtractedMessage:
    """Message extracted from a webhook payload."""

    text: str
    sender_id: str
    platform_context: dict = field(default_factory=dict)


@dataclass
class HandshakeResult:
    """Result of a platform handshake check."""

    is_handshake: bool
    response: JSONResponse | dict | None = None


@dataclass
class ConnectorFieldDef:
    """Field definition for connector configuration."""

    key: str
    label: str
    placeholder: str = ""
    is_secret: bool = True
    is_required: bool = True


@dataclass
class ConnectorTypeMeta:
    """Metadata describing a connector type for backend validation and frontend UI."""

    type_id: str
    name: str
    icon: str
    color: str
    description: str
    doc_url: str
    setup_steps: list[str]
    fields: list[ConnectorFieldDef]


class PlatformAdapter(ABC):
    """Base class all platform adapters must implement."""

    @abstractmethod
    async def verify_signature(
        self, request: Request, body: bytes, connector: Connector
    ) -> None:
        """Raise HTTPException(401/403) if the request signature is invalid."""

    @abstractmethod
    async def handle_handshake(
        self, request: Request, payload: dict, connector: Connector
    ) -> HandshakeResult:
        """Handle platform verification handshakes (PING, URL challenge, etc.)."""

    @abstractmethod
    def extract_message(self, payload: dict) -> ExtractedMessage | None:
        """Extract user message and platform context from webhook payload."""

    @abstractmethod
    async def send_response(
        self, connector: Connector, platform_context: dict, response_text: str
    ) -> None:
        """Deliver the agent response back to the user on the platform."""

    @abstractmethod
    def requires_deferred_execution(self) -> bool:
        """Whether the platform requires background execution (tight timeout)."""

    @abstractmethod
    def deferred_ack_response(self, payload: dict) -> dict | JSONResponse:
        """Immediate acknowledgment response for deferred execution platforms."""

    @classmethod
    @abstractmethod
    def metadata(cls) -> ConnectorTypeMeta:
        """Return connector type metadata (fields, setup steps, doc URL)."""

    @classmethod
    def allowed_config_keys(cls) -> frozenset[str]:
        """Derive allowed config keys from metadata fields."""
        return frozenset(f.key for f in cls.metadata().fields)
