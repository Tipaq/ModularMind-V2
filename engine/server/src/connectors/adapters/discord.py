"""Discord platform adapter — Ed25519 signature, slash commands, deferred followup."""

import logging

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from src.connectors.adapters.base import (
    ConnectorFieldDef,
    ConnectorTypeMeta,
    ExtractedMessage,
    HandshakeResult,
    PlatformAdapter,
)
from src.connectors.models import Connector

logger = logging.getLogger(__name__)

DISCORD_MESSAGE_LIMIT = 2000


class DiscordAdapter(PlatformAdapter):
    """Adapter for Discord interactions (slash commands + message components)."""

    async def verify_signature(
        self,
        request: Request,
        body: bytes,
        connector: Connector,
        credentials: dict[str, str],
    ) -> None:
        signature = request.headers.get("X-Signature-Ed25519")
        timestamp = request.headers.get("X-Signature-Timestamp")
        if not signature or not timestamp:
            raise HTTPException(
                status_code=401,
                detail="Missing Discord signature headers",
            )

        public_key = (connector.config or {}).get("public_key", "")
        if not public_key:
            raise HTTPException(
                status_code=500,
                detail="Discord public_key not configured",
            )

        if not _verify_ed25519(body, signature, timestamp, public_key):
            raise HTTPException(
                status_code=401, detail="Invalid Discord signature"
            )

    async def handle_handshake(
        self, request: Request, payload: dict, connector: Connector
    ) -> HandshakeResult:
        if payload.get("type") == 1:
            return HandshakeResult(
                is_handshake=True,
                response=JSONResponse(content={"type": 1}),
            )
        return HandshakeResult(is_handshake=False)

    def extract_message(self, payload: dict) -> ExtractedMessage | None:
        interaction_type = payload.get("type")
        user = payload.get("member", {}).get("user", {}) or payload.get(
            "user", {}
        )
        sender_id = user.get("id", "unknown")

        text = _extract_interaction_text(
            interaction_type, payload.get("data", {})
        )
        if not text:
            return None

        return ExtractedMessage(
            text=text,
            sender_id=sender_id,
            platform_context={
                "application_id": payload.get("application_id", ""),
                "interaction_token": payload.get("token", ""),
            },
        )

    async def send_response(
        self,
        platform_context: dict,
        response_text: str,
        credentials: dict[str, str],
    ) -> None:
        application_id = platform_context.get("application_id", "")
        interaction_token = platform_context.get(
            "interaction_token", ""
        )
        if not application_id or not interaction_token:
            logger.warning(
                "Discord followup missing "
                "application_id or interaction_token"
            )
            return

        url = (
            f"https://discord.com/api/v10/webhooks/"
            f"{application_id}/{interaction_token}"
            f"/messages/@original"
        )
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.patch(
                    url,
                    json={
                        "content": response_text[:DISCORD_MESSAGE_LIMIT]
                    },
                )
                if resp.status_code >= 400:
                    logger.warning(
                        "Discord followup failed (%s): %s",
                        resp.status_code,
                        resp.text,
                    )
        except httpx.HTTPError:
            logger.exception("Failed to send Discord followup")

    def requires_deferred_execution(self) -> bool:
        return True

    def deferred_ack_response(self, payload: dict) -> JSONResponse:
        return JSONResponse(content={"type": 5})

    @classmethod
    def metadata(cls) -> ConnectorTypeMeta:
        return ConnectorTypeMeta(
            type_id="discord",
            name="Discord",
            icon="discord",
            color="bg-accent",
            description=(
                "Connect your bot to a Discord server "
                "via slash commands"
            ),
            doc_url=(
                "https://discord.com/developers"
                "/docs/getting-started"
            ),
            setup_steps=[
                "Create an application at "
                "discord.com/developers/applications",
                'Under "Bot", click Reset Token '
                "and copy the Bot Token",
                'Under "General Information", '
                "copy Application ID and Public Key",
                'Under "OAuth2 > URL Generator", select '
                "bot + applications.commands scopes, "
                "then invite to your server",
                "Fill in the credentials below and click Connect",
                "Copy the Webhook URL below and paste it in "
                '"Interactions Endpoint URL" in your '
                "Discord app settings",
            ],
            fields=[
                ConnectorFieldDef(
                    key="bot_token",
                    label="Bot Token",
                    is_secret=True,
                ),
                ConnectorFieldDef(
                    key="application_id",
                    label="Application ID",
                    is_secret=False,
                ),
                ConnectorFieldDef(
                    key="public_key",
                    label="Public Key",
                    is_secret=False,
                ),
                ConnectorFieldDef(
                    key="guild_id",
                    label="Guild ID",
                    is_secret=False,
                    is_required=False,
                ),
                ConnectorFieldDef(
                    key="channel_id",
                    label="Channel ID",
                    is_secret=False,
                    is_required=False,
                ),
            ],
        )


def _verify_ed25519(
    body: bytes,
    signature: str,
    timestamp: str,
    public_key_hex: str,
) -> bool:
    try:
        from nacl.exceptions import BadSignatureError
        from nacl.signing import VerifyKey
    except ImportError:
        logger.error(
            "PyNaCl not installed — cannot verify Discord signatures"
        )
        return False

    try:
        verify_key = VerifyKey(bytes.fromhex(public_key_hex))
        verify_key.verify(
            timestamp.encode() + body, bytes.fromhex(signature)
        )
        return True
    except (BadSignatureError, ValueError, Exception):
        return False


def _extract_interaction_text(
    interaction_type: int | None, data: dict
) -> str | None:
    if interaction_type == 2:
        options = data.get("options", [])
        for opt in options:
            if opt.get("type") == 3:
                return opt.get("value")
        return data.get("name")

    if interaction_type == 3:
        return data.get("custom_id")

    return None
