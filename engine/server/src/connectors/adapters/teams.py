"""Microsoft Teams adapter — generic secret auth, noop response delivery."""

import hmac
import logging

from fastapi import HTTPException, Request

from src.connectors.adapters.base import (
    ConnectorFieldDef,
    ConnectorTypeMeta,
    ExtractedMessage,
    HandshakeResult,
    PlatformAdapter,
)
from src.connectors.models import Connector

logger = logging.getLogger(__name__)


class TeamsAdapter(PlatformAdapter):
    """Adapter for Microsoft Teams Bot Framework webhooks."""

    async def verify_signature(
        self, request: Request, body: bytes, connector: Connector
    ) -> None:
        secret = request.headers.get("X-Webhook-Secret", "")
        if not secret:
            raise HTTPException(status_code=401, detail="Missing X-Webhook-Secret header")
        if not hmac.compare_digest(connector.webhook_secret, secret):
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    async def handle_handshake(
        self, request: Request, payload: dict, connector: Connector
    ) -> HandshakeResult:
        return HandshakeResult(is_handshake=False)

    def extract_message(self, payload: dict) -> ExtractedMessage | None:
        if payload.get("type") != "message":
            return None
        text = payload.get("text")
        if not text:
            return None
        return ExtractedMessage(
            text=text,
            sender_id=payload.get("from", {}).get("id", "unknown"),
            platform_context={"service_url": payload.get("serviceUrl", "")},
        )

    async def send_response(
        self, connector: Connector | None, platform_context: dict, response_text: str
    ) -> None:
        logger.debug("Teams response delivery not implemented — response returned in HTTP body")

    def requires_deferred_execution(self) -> bool:
        return False

    def deferred_ack_response(self, payload: dict) -> dict:
        return {}

    @classmethod
    def metadata(cls) -> ConnectorTypeMeta:
        return ConnectorTypeMeta(
            type_id="teams",
            name="Microsoft Teams",
            icon="message-square",
            color="bg-info",
            description="Receive messages from Microsoft Teams via Bot Framework",
            doc_url="https://learn.microsoft.com/en-us/microsoftteams/platform/bots/",
            setup_steps=[
                "Register a bot in the Azure Bot Service",
                "Configure the messaging endpoint to the Webhook URL below",
                "Install the bot in your Teams tenant",
                "Fill in the credentials below and click Connect",
            ],
            fields=[
                ConnectorFieldDef(key="app_id", label="App ID", is_secret=False),
                ConnectorFieldDef(key="app_secret", label="App Secret"),
                ConnectorFieldDef(key="tenant_id", label="Tenant ID", is_secret=False),
                ConnectorFieldDef(
                    key="channel", label="Channel", is_secret=False, is_required=False
                ),
            ],
        )
