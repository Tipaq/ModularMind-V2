"""Slack platform adapter — HMAC-SHA256 signature, Events API, chat.postMessage."""

import hashlib
import hmac
import logging
import time

import httpx
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

SLACK_REPLAY_WINDOW_SECONDS = 300


class SlackAdapter(PlatformAdapter):
    """Adapter for Slack Events API webhooks."""

    async def verify_signature(
        self, request: Request, body: bytes, connector: Connector
    ) -> None:
        signature = request.headers.get("X-Slack-Signature")
        timestamp = request.headers.get("X-Slack-Request-Timestamp")
        if not signature or not timestamp:
            raise HTTPException(status_code=401, detail="Missing Slack signature headers")

        signing_secret = (connector.config or {}).get("signing_secret", "")
        if not signing_secret:
            signing_secret = connector.webhook_secret

        if not _verify_slack_hmac(body, timestamp, signature, signing_secret):
            raise HTTPException(status_code=403, detail="Invalid Slack signature")

    async def handle_handshake(
        self, request: Request, payload: dict, connector: Connector
    ) -> HandshakeResult:
        if payload.get("type") == "url_verification":
            return HandshakeResult(
                is_handshake=True, response={"challenge": payload.get("challenge")}
            )
        return HandshakeResult(is_handshake=False)

    def extract_message(self, payload: dict) -> ExtractedMessage | None:
        event = payload.get("event", {})
        if event.get("type") != "message" or event.get("bot_id"):
            return None

        text = event.get("text")
        if not text:
            return None

        return ExtractedMessage(
            text=text,
            sender_id=event.get("user", "unknown"),
            platform_context={
                "channel": event.get("channel", ""),
                "thread_ts": event.get("thread_ts") or event.get("ts", ""),
            },
        )

    async def send_response(
        self, connector: Connector | None, platform_context: dict, response_text: str
    ) -> None:
        bot_token = ""
        if connector:
            bot_token = (connector.config or {}).get("bot_token", "")
        if not bot_token:
            logger.warning("Slack bot_token not configured — cannot send response")
            return

        channel = platform_context.get("channel", "")
        if not channel:
            logger.warning("Slack channel missing from platform context")
            return

        payload = {"channel": channel, "text": response_text}
        thread_ts = platform_context.get("thread_ts")
        if thread_ts:
            payload["thread_ts"] = thread_ts

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://slack.com/api/chat.postMessage",
                    headers={"Authorization": f"Bearer {bot_token}"},
                    json=payload,
                )
                data = resp.json()
                if not data.get("ok"):
                    logger.warning("Slack chat.postMessage failed: %s", data.get("error"))
        except httpx.HTTPError:
            logger.exception("Failed to send Slack response")

    def requires_deferred_execution(self) -> bool:
        return False

    def deferred_ack_response(self, payload: dict) -> dict:
        return {}

    @classmethod
    def metadata(cls) -> ConnectorTypeMeta:
        return ConnectorTypeMeta(
            type_id="slack",
            name="Slack",
            icon="hash",
            color="bg-secondary",
            description="Receive and respond to messages via Slack Events API",
            doc_url="https://api.slack.com/events-api",
            setup_steps=[
                "Create a Slack app at api.slack.com/apps",
                "Under Event Subscriptions, enable events and add bot events (message.im)",
                "Under OAuth & Permissions, add chat:write scope and install to workspace",
                "Copy the Bot Token and Signing Secret",
                "Fill in the credentials below and click Connect",
                "Copy the Webhook URL and paste it as the Request URL in Event Subscriptions",
            ],
            fields=[
                ConnectorFieldDef(key="bot_token", label="Bot Token", placeholder="xoxb-..."),
                ConnectorFieldDef(key="signing_secret", label="Signing Secret"),
                ConnectorFieldDef(
                    key="channel", label="Channel", is_secret=False, is_required=False
                ),
            ],
        )


def _verify_slack_hmac(
    body: bytes, timestamp: str, signature: str, signing_secret: str
) -> bool:
    try:
        ts = int(timestamp)
    except (ValueError, TypeError):
        return False

    if abs(time.time() - ts) > SLACK_REPLAY_WINDOW_SECONDS:
        return False

    sig_basestring = f"v0:{timestamp}:{body.decode('utf-8')}"
    digest = hmac.new(
        signing_secret.encode(), sig_basestring.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"v0={digest}", signature)
