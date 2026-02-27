"""Outbound webhook sender for execution events.

Sends HTTP POST notifications when approval is required or other
execution events occur. Supports HMAC-SHA256 signature verification
and exponential backoff retry for server errors.
"""

import asyncio
import hashlib
import hmac
import json
import logging
from typing import Any

import httpx

from src.infra.url_validation import validate_url_ssrf

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT = 10  # seconds
WEBHOOK_MAX_RETRIES = 3


async def send_approval_webhook(
    url: str,
    execution_id: str,
    node_id: str,
    timeout_seconds: int,
    secret: str | None = None,
) -> bool:
    """Send outbound webhook when approval is required.

    Args:
        url: Webhook URL to POST to
        execution_id: ID of the execution awaiting approval
        node_id: ID of the node that triggered approval
        timeout_seconds: Seconds until timeout
        secret: Optional HMAC secret for signature verification

    Returns:
        True if webhook delivered successfully
    """
    payload = {
        "event": "approval_required",
        "execution_id": execution_id,
        "node_id": node_id,
        "timeout_seconds": timeout_seconds,
        "approve_url": f"/api/v1/executions/{execution_id}/approve",
        "reject_url": f"/api/v1/executions/{execution_id}/reject",
    }

    return await _send_with_retry(url, payload, secret=secret)


async def send_webhook_event(
    url: str,
    event_type: str,
    payload: dict[str, Any],
    secret: str | None = None,
) -> bool:
    """Generic webhook sender for any event type.

    Args:
        url: Webhook URL to POST to
        event_type: Event type string
        payload: Event payload dict
        secret: Optional HMAC secret for signature verification

    Returns:
        True if webhook delivered successfully
    """
    payload["event"] = event_type
    return await _send_with_retry(url, payload, secret=secret)


async def _send_with_retry(
    url: str,
    payload: dict[str, Any],
    secret: str | None = None,
) -> bool:
    """Send webhook POST with retry and exponential backoff.

    Retries on network errors and 5xx server errors.
    Does NOT retry on 4xx client errors (immediate failure).
    """
    # SSRF check: block requests to internal networks / cloud metadata
    ssrf_error = validate_url_ssrf(url, resolve_dns=True)
    if ssrf_error:
        logger.error("Webhook URL blocked by SSRF validation: %s (%s)", url, ssrf_error)
        return False

    body = json.dumps(payload, default=str)
    headers: dict[str, str] = {"Content-Type": "application/json"}

    if secret:
        signature = hmac.new(
            secret.encode(), body.encode(), hashlib.sha256,
        ).hexdigest()
        headers["X-Webhook-Signature"] = f"sha256={signature}"

    async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT) as client:
        for attempt in range(WEBHOOK_MAX_RETRIES):
            try:
                response = await client.post(url, content=body, headers=headers)

                if response.status_code < 300:
                    logger.info(
                        "Webhook delivered: %s (status %d)",
                        url, response.status_code,
                    )
                    return True

                if response.status_code >= 500:
                    # Server error — retry with backoff
                    logger.warning(
                        "Webhook server error (attempt %d/%d): status %d from %s",
                        attempt + 1, WEBHOOK_MAX_RETRIES, response.status_code, url,
                    )
                else:
                    # Client error (4xx) — don't retry
                    logger.error(
                        "Webhook client error: status %d from %s",
                        response.status_code, url,
                    )
                    return False

            except httpx.RequestError as e:
                logger.warning(
                    "Webhook request error (attempt %d/%d): %s",
                    attempt + 1, WEBHOOK_MAX_RETRIES, e,
                )

            # Exponential backoff: 1s, 2s, 4s
            if attempt < WEBHOOK_MAX_RETRIES - 1:
                await asyncio.sleep(2 ** attempt)

    logger.error(
        "Webhook failed after %d attempts: %s", WEBHOOK_MAX_RETRIES, url,
    )
    return False
