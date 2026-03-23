"""Email adapter — generic secret auth, noop response delivery."""

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


class EmailAdapter(PlatformAdapter):
    """Adapter for email webhook integrations."""

    async def verify_signature(self, request: Request, body: bytes, connector: Connector) -> None:
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
        subject = payload.get("subject", "")
        body_text = payload.get("body", "")
        text = _build_email_text(subject, body_text)
        if not text:
            return None
        return ExtractedMessage(
            text=text,
            sender_id=payload.get("from", "unknown"),
            platform_context={"reply_to": payload.get("from", "")},
        )

    async def send_response(
        self, connector: Connector | None, platform_context: dict, response_text: str
    ) -> None:
        logger.debug("Email response delivery not implemented — response returned in HTTP body")

    def requires_deferred_execution(self) -> bool:
        return False

    def deferred_ack_response(self, payload: dict) -> dict:
        return {}

    @classmethod
    def metadata(cls) -> ConnectorTypeMeta:
        return ConnectorTypeMeta(
            type_id="email",
            name="Email",
            icon="mail",
            color="bg-success",
            description="Receive messages via email webhooks",
            doc_url="https://sendgrid.com/docs/for-developers/parsing-email/",
            setup_steps=[
                "Configure your email provider to forward inbound emails as webhooks",
                "Set the webhook URL to the Webhook URL below",
                "Fill in the credentials below and click Connect",
            ],
            fields=[
                ConnectorFieldDef(key="address", label="Email Address", is_secret=False),
                ConnectorFieldDef(key="smtp_host", label="SMTP Host", is_secret=False),
                ConnectorFieldDef(
                    key="smtp_port", label="SMTP Port", is_secret=False, is_required=False
                ),
                ConnectorFieldDef(
                    key="imap_host", label="IMAP Host", is_secret=False, is_required=False
                ),
                ConnectorFieldDef(
                    key="use_tls",
                    label="Use TLS",
                    is_secret=False,
                    is_required=False,
                    placeholder="true",
                ),
            ],
        )


def _build_email_text(subject: str, body: str) -> str | None:
    if subject and body:
        return f"Subject: {subject}\n\n{body}"
    return body or subject or None
