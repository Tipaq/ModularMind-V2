"""Spec-based adapter — generic inbound adapter driven by Connector.spec JSON."""

import hashlib
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


class SpecBasedAdapter(PlatformAdapter):
    """Generic adapter that interprets Connector.spec for inbound webhooks.

    Used for AI-generated and user-imported connector types
    that don't have a dedicated Python adapter.
    """

    def __init__(self, spec: dict):
        self._spec = spec
        self._inbound = spec.get("inbound", {}).get("webhook", {})

    async def verify_signature(
        self,
        request: Request,
        body: bytes,
        connector: Connector,
        credentials: dict[str, str],
    ) -> None:
        header_name = self._inbound.get("signature_header", "")
        algo = self._inbound.get("signature_algo", "")

        if not header_name:
            return

        signature = request.headers.get(header_name, "")
        if not signature:
            raise HTTPException(
                status_code=401,
                detail=f"Missing {header_name} header",
            )

        signing_key = (
            credentials.get("signing_secret", "")
            or credentials.get("app_secret", "")
            or connector.webhook_secret
        )

        if algo == "hmac-sha256":
            expected = hmac.new(
                signing_key.encode(), body, hashlib.sha256
            ).hexdigest()
            expected_prefixed = f"sha256={expected}"

            if not (
                hmac.compare_digest(expected, signature)
                or hmac.compare_digest(expected_prefixed, signature)
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Invalid webhook signature",
                )
        elif algo == "hmac-sha1":
            expected = hmac.new(
                signing_key.encode(), body, hashlib.sha1
            ).hexdigest()
            if not hmac.compare_digest(expected, signature):
                raise HTTPException(
                    status_code=403,
                    detail="Invalid webhook signature",
                )
        else:
            if not hmac.compare_digest(signing_key, signature):
                raise HTTPException(
                    status_code=403,
                    detail="Invalid webhook signature",
                )

    async def handle_handshake(
        self, request: Request, payload: dict, connector: Connector
    ) -> HandshakeResult:
        challenge_field = self._inbound.get("challenge_field", "")
        if challenge_field and challenge_field in payload:
            return HandshakeResult(
                is_handshake=True,
                response={challenge_field: payload[challenge_field]},
            )
        return HandshakeResult(is_handshake=False)

    def extract_message(self, payload: dict) -> ExtractedMessage | None:
        message_path = self._inbound.get("message_path", "")
        sender_path = self._inbound.get("sender_path", "")

        text = _extract_by_path(payload, message_path) if message_path else None
        if not text or not isinstance(text, str):
            return None

        sender = _extract_by_path(payload, sender_path) if sender_path else "unknown"

        return ExtractedMessage(
            text=text,
            sender_id=str(sender) if sender else "unknown",
            platform_context={"raw_payload": payload},
        )

    async def send_response(
        self,
        platform_context: dict,
        response_text: str,
        credentials: dict[str, str],
    ) -> None:
        logger.debug(
            "Spec-based adapter: response delivery not implemented — "
            "use outbound connector tools for bidirectional"
        )

    def requires_deferred_execution(self) -> bool:
        return False

    def deferred_ack_response(self, payload: dict) -> dict:
        return {}

    @classmethod
    def metadata(cls) -> ConnectorTypeMeta:
        return ConnectorTypeMeta(
            type_id="custom",
            name="Custom",
            icon="plug",
            color="bg-muted",
            description="Custom connector defined by spec",
            doc_url="",
            setup_steps=[],
            fields=[],
        )

    def spec_metadata(self) -> ConnectorTypeMeta:
        auth_config = self._spec.get("auth", {})
        modes = auth_config.get("modes", [])

        fields: list[ConnectorFieldDef] = []
        for mode in modes:
            for field in mode.get("fields", []):
                fields.append(
                    ConnectorFieldDef(
                        key=field["key"],
                        label=field.get("label", field["key"]),
                        placeholder=field.get("placeholder", ""),
                        is_secret=field.get("is_secret", True),
                        is_required=field.get("is_required", True),
                    )
                )

        return ConnectorTypeMeta(
            type_id="custom",
            name=self._spec.get("name", "Custom Connector"),
            icon="plug",
            color="bg-muted",
            description=self._spec.get("description", ""),
            doc_url="",
            setup_steps=[],
            fields=fields,
        )


def _extract_by_path(data: dict, path: str) -> str | dict | list | None:
    """Simple JSONPath extraction ($.a.b.c format)."""
    if not path or not path.startswith("$."):
        return None

    keys = path[2:].split(".")
    current = data
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key)
            if current is None:
                return None
        else:
            return None
    return current
