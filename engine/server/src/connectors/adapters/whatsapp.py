"""WhatsApp adapter — Meta Cloud API with HMAC-SHA256 signature verification."""

import hashlib
import hmac
import logging

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import PlainTextResponse

from src.connectors.adapters.base import (
    ConnectorFieldDef,
    ConnectorTypeMeta,
    ExtractedMessage,
    HandshakeResult,
    PlatformAdapter,
)
from src.connectors.models import Connector

logger = logging.getLogger(__name__)

WHATSAPP_MESSAGE_LIMIT = 4096
GRAPH_API_VERSION = "v21.0"


class WhatsAppAdapter(PlatformAdapter):
    """Adapter for WhatsApp Cloud API (Meta Business) webhooks."""

    async def verify_signature(self, request: Request, body: bytes, connector: Connector) -> None:
        signature_header = request.headers.get("X-Hub-Signature-256", "")
        if not signature_header:
            raise HTTPException(status_code=401, detail="Missing X-Hub-Signature-256 header")

        app_secret = (connector.config or {}).get("app_secret", "")
        if not app_secret:
            raise HTTPException(status_code=500, detail="WhatsApp app_secret not configured")

        expected = "sha256=" + hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()

        if not hmac.compare_digest(expected, signature_header):
            raise HTTPException(status_code=403, detail="Invalid WhatsApp signature")

    async def handle_handshake(
        self, request: Request, payload: dict, connector: Connector
    ) -> HandshakeResult:
        return HandshakeResult(is_handshake=False)

    async def handle_get_handshake(self, request: Request, connector: Connector) -> HandshakeResult:
        """Handle WhatsApp GET webhook verification (hub.challenge)."""
        params = request.query_params
        mode = params.get("hub.mode")
        token = params.get("hub.verify_token")
        challenge = params.get("hub.challenge")

        if mode != "subscribe" or not challenge:
            return HandshakeResult(is_handshake=False)

        verify_token = (connector.config or {}).get("verify_token", "")
        if not verify_token or token != verify_token:
            raise HTTPException(status_code=403, detail="Invalid verify token")

        return HandshakeResult(
            is_handshake=True,
            response=PlainTextResponse(content=challenge),
        )

    def extract_message(self, payload: dict) -> ExtractedMessage | None:
        entry = payload.get("entry", [])
        if not entry:
            return None

        changes = entry[0].get("changes", [])
        if not changes:
            return None

        value = changes[0].get("value", {})
        messages = value.get("messages", [])
        if not messages:
            return None

        message = messages[0]
        text_obj = message.get("text")
        if not text_obj:
            return None

        text = text_obj.get("body", "") if isinstance(text_obj, dict) else str(text_obj)
        if not text:
            return None

        metadata = value.get("metadata", {})
        return ExtractedMessage(
            text=text,
            sender_id=message.get("from", "unknown"),
            platform_context={
                "phone_number_id": metadata.get("phone_number_id", ""),
                "from": message.get("from", ""),
            },
        )

    async def send_response(
        self, connector: Connector | None, platform_context: dict, response_text: str
    ) -> None:
        access_token = ""
        if connector:
            access_token = (connector.config or {}).get("access_token", "")
        access_token = access_token or platform_context.get("access_token", "")

        phone_number_id = platform_context.get("phone_number_id", "")
        recipient = platform_context.get("from", "")

        if not access_token or not phone_number_id or not recipient:
            logger.warning("WhatsApp missing access_token, phone_number_id, or recipient")
            return

        url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"
        text = response_text[:WHATSAPP_MESSAGE_LIMIT]

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={
                        "messaging_product": "whatsapp",
                        "to": recipient,
                        "type": "text",
                        "text": {"body": text},
                    },
                )
                if resp.status_code >= 400:
                    logger.warning("WhatsApp send failed (%s): %s", resp.status_code, resp.text)
        except httpx.HTTPError:
            logger.exception("Failed to send WhatsApp response")

    def requires_deferred_execution(self) -> bool:
        return False

    def deferred_ack_response(self, payload: dict) -> dict:
        return {}

    @classmethod
    def metadata(cls) -> ConnectorTypeMeta:
        return ConnectorTypeMeta(
            type_id="whatsapp",
            name="WhatsApp",
            icon="message-circle",
            color="bg-success",
            description="Receive and respond to messages via WhatsApp Cloud API",
            doc_url="https://developers.facebook.com/docs/whatsapp/cloud-api/",
            setup_steps=[
                "Create an app on developers.facebook.com and enable WhatsApp product",
                "Under WhatsApp > API Setup, note the Phone Number ID and generate an access token",
                "Choose a verify token (any string) for webhook verification",
                "Fill in the credentials below and click Connect",
                "Copy the Webhook URL and paste it in the WhatsApp webhook configuration",
                "Subscribe to the 'messages' webhook field",
            ],
            fields=[
                ConnectorFieldDef(key="access_token", label="Access Token"),
                ConnectorFieldDef(key="app_secret", label="App Secret"),
                ConnectorFieldDef(
                    key="verify_token",
                    label="Verify Token",
                    is_secret=False,
                    placeholder="any-string-you-choose",
                ),
                ConnectorFieldDef(key="phone_number_id", label="Phone Number ID", is_secret=False),
            ],
        )
