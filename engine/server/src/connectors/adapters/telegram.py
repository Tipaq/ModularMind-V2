"""Telegram adapter — Bot API webhook with secret token verification."""

import logging

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

TELEGRAM_MESSAGE_LIMIT = 4096


class TelegramAdapter(PlatformAdapter):
    """Adapter for Telegram Bot API webhooks."""

    async def verify_signature(
        self,
        request: Request,
        body: bytes,
        connector: Connector,
        credentials: dict[str, str],
    ) -> None:
        token = request.headers.get(
            "X-Telegram-Bot-Api-Secret-Token", ""
        )
        if not token:
            raise HTTPException(
                status_code=401,
                detail="Missing Telegram secret token header",
            )
        if token != connector.webhook_secret:
            raise HTTPException(
                status_code=403,
                detail="Invalid Telegram secret token",
            )

    async def handle_handshake(
        self, request: Request, payload: dict, connector: Connector
    ) -> HandshakeResult:
        return HandshakeResult(is_handshake=False)

    def extract_message(self, payload: dict) -> ExtractedMessage | None:
        message = payload.get("message") or payload.get("edited_message")
        if not message:
            return None

        text = message.get("text")
        if not text:
            return None

        chat = message.get("chat", {})
        sender = message.get("from", {})

        return ExtractedMessage(
            text=text,
            sender_id=str(sender.get("id", "unknown")),
            platform_context={"chat_id": chat.get("id")},
        )

    async def send_response(
        self,
        platform_context: dict,
        response_text: str,
        credentials: dict[str, str],
    ) -> None:
        bot_token = credentials.get("bot_token", "")
        chat_id = platform_context.get("chat_id")
        if not bot_token or not chat_id:
            logger.warning(
                "Telegram bot_token or chat_id missing — cannot send"
            )
            return

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        chunks = _split_text(response_text, TELEGRAM_MESSAGE_LIMIT)

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                for chunk in chunks:
                    resp = await client.post(
                        url, json={"chat_id": chat_id, "text": chunk}
                    )
                    if resp.status_code >= 400:
                        logger.warning(
                            "Telegram sendMessage failed (%s): %s",
                            resp.status_code,
                            resp.text,
                        )
                        break
        except httpx.HTTPError:
            logger.exception("Failed to send Telegram response")

    def requires_deferred_execution(self) -> bool:
        return False

    def deferred_ack_response(self, payload: dict) -> dict:
        return {}

    @classmethod
    def metadata(cls) -> ConnectorTypeMeta:
        return ConnectorTypeMeta(
            type_id="telegram",
            name="Telegram",
            icon="send",
            color="bg-info",
            description=(
                "Receive and respond to messages via Telegram Bot API"
            ),
            doc_url="https://core.telegram.org/bots/api",
            setup_steps=[
                "Create a bot via @BotFather on Telegram "
                "and copy the Bot Token",
                "Fill in the credentials below and click Connect",
                "Copy the Webhook URL below",
                "Register the webhook: "
                "curl -X POST "
                "https://api.telegram.org/bot<TOKEN>/setWebhook "
                "-d url=<WEBHOOK_URL> "
                "-d secret_token=<WEBHOOK_SECRET>",
                "Send a message to your bot on Telegram to test",
            ],
            fields=[
                ConnectorFieldDef(
                    key="bot_token",
                    label="Bot Token",
                    placeholder="123456:ABC...",
                ),
            ],
        )


def _split_text(text: str, limit: int) -> list[str]:
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    while text:
        chunks.append(text[:limit])
        text = text[limit:]
    return chunks
