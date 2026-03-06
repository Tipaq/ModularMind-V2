"""
Webhook receiver router.

Handles incoming webhook requests from external services (Slack, Teams, Email, Discord).
"""

import asyncio
import hashlib
import hmac
import logging
import time
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from src.executions.scheduler import fair_scheduler
from src.executions.schemas import ExecutionCreate
from src.executions.service import ExecutionService
from src.infra.constants import DISCORD_MAX_CONCURRENT, RATE_LIMIT_WEBHOOK
from src.infra.database import DbSession, async_session_maker
from src.infra.rate_limit import RateLimitDependency

from .models import Connector

logger = logging.getLogger(__name__)

webhook_router = APIRouter(tags=["Webhooks"])

_webhook_rate_limit = RateLimitDependency(requests_per_minute=RATE_LIMIT_WEBHOOK)

_discord_semaphore = asyncio.Semaphore(DISCORD_MAX_CONCURRENT)
_discord_background_tasks: set[asyncio.Task] = set()


# ─── Signature verification ──────────────────────────────────────────────────


def verify_slack_signature(
    body: bytes,
    timestamp: str,
    signature: str,
    signing_secret: str,
) -> bool:
    """Verify Slack request signature (v0 HMAC-SHA256).

    See: https://api.slack.com/authentication/verifying-requests-from-slack
    """
    # Reject requests older than 5 minutes to prevent replay attacks
    try:
        ts = int(timestamp)
    except (ValueError, TypeError):
        return False
    if abs(time.time() - ts) > 300:
        return False

    sig_basestring = f"v0:{timestamp}:{body.decode('utf-8')}"
    computed = "v0=" + hmac.new(
        signing_secret.encode(), sig_basestring.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, signature)


def verify_discord_signature(
    body: bytes,
    signature: str,
    timestamp: str,
    public_key_hex: str,
) -> bool:
    """Verify Discord interaction signature (Ed25519).

    See: https://discord.com/developers/docs/interactions/receiving-and-responding
    """
    try:
        from nacl.exceptions import BadSignatureError
        from nacl.signing import VerifyKey
    except ImportError:
        logger.error("PyNaCl not installed — cannot verify Discord signatures")
        return False

    try:
        verify_key = VerifyKey(bytes.fromhex(public_key_hex))
        verify_key.verify(timestamp.encode() + body, bytes.fromhex(signature))
        return True
    except (BadSignatureError, ValueError, Exception):
        return False


# ─── Message extractors ──────────────────────────────────────────────────────


def extract_slack_message(payload: dict) -> str | None:
    """Extract message text from Slack Events API payload."""
    # Handle URL verification challenge
    if payload.get("type") == "url_verification":
        return None

    event = payload.get("event", {})
    if event.get("type") == "message" and not event.get("bot_id"):
        return event.get("text")

    return None


def extract_teams_message(payload: dict) -> str | None:
    """Extract message text from Teams Bot Framework activity."""
    if payload.get("type") == "message":
        return payload.get("text")
    return None


def extract_email_message(payload: dict) -> str | None:
    """Extract message from email webhook payload."""
    subject = payload.get("subject", "")
    body = payload.get("body", "")
    if subject and body:
        return f"Subject: {subject}\n\n{body}"
    return body or subject or None


def extract_discord_message(payload: dict) -> str | None:
    """Extract message from Discord interaction payload.

    Supports:
    - Type 2 (APPLICATION_COMMAND): slash command options or command name
    - Type 3 (MESSAGE_COMPONENT): custom_id from button/select interactions
    """
    interaction_type = payload.get("type")

    if interaction_type == 2:
        # Slash command — extract first string option, fallback to command name
        data = payload.get("data", {})
        options = data.get("options", [])
        for opt in options:
            if opt.get("type") == 3:  # STRING option type
                return opt.get("value")
        # Fallback: use the command name itself
        return data.get("name")

    if interaction_type == 3:
        # Message component (button, select menu)
        data = payload.get("data", {})
        return data.get("custom_id")

    return None


EXTRACTORS = {
    "slack": extract_slack_message,
    "teams": extract_teams_message,
    "email": extract_email_message,
    "discord": extract_discord_message,
}


# ─── Discord followup ────────────────────────────────────────────────────────


async def send_discord_followup(
    application_id: str,
    interaction_token: str,
    content: str,
) -> None:
    """Edit the original deferred response with the agent's output.

    Discord limits message content to 2000 characters.
    """
    url = (
        f"https://discord.com/api/v10/webhooks/"
        f"{application_id}/{interaction_token}/messages/@original"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.patch(url, json={"content": content[:2000]})
            if resp.status_code >= 400:
                logger.warning(
                    "Discord followup failed (%s): %s", resp.status_code, resp.text
                )
    except httpx.HTTPError:
        logger.exception("Failed to send Discord followup")


async def _run_discord_agent(
    connector_agent_id: str,
    connector_id: str,
    message: str,
    application_id: str,
    interaction_token: str,
) -> None:
    """Execute agent in background and send result back to Discord.

    Runs under a semaphore to cap concurrent background tasks.
    """
    async with _discord_semaphore, async_session_maker() as db:
      try:
          exec_service = ExecutionService(db)

          execution = await exec_service.start_agent_execution(
              agent_id=connector_agent_id,
              data=ExecutionCreate(prompt=message),
              user_id=f"system:webhook:{connector_id}",
          )
          await db.commit()

          # Dispatch to Redis Streams worker
          acquired = await fair_scheduler.acquire("webhook", execution.id)
          if not acquired:
              await send_discord_followup(
                  application_id,
                  interaction_token,
                  "Too many requests — please try again later.",
              )
              return
          await exec_service.dispatch_execution(execution)
          await db.commit()

          # Wait for result via inline execution streaming
          response_text = ""
          async for event in exec_service.execute(execution.id):
              if event.get("type") == "complete":
                  output = event.get("output", {})
                  response_text = output.get("response", str(output))
                  break

          await db.commit()
          await send_discord_followup(
              application_id,
              interaction_token,
              response_text or "No response generated.",
          )
      except Exception:  # Background task catch-all; must not crash silently
          logger.exception("Discord background agent execution failed")
          await send_discord_followup(
              application_id,
              interaction_token,
              "An error occurred while processing your request.",
          )


# ─── Webhook endpoint ────────────────────────────────────────────────────────


@webhook_router.post(
    "/{connector_id}",
    dependencies=[Depends(_webhook_rate_limit)],
)
async def receive_webhook(
    connector_id: str,
    request: Request,
    db: DbSession,
) -> dict:
    """Receive and process webhook from external service.

    Authentication methods (checked by connector type):
    1. Slack: Body signature verification (X-Slack-Signature + X-Slack-Request-Timestamp)
    2. Discord: Ed25519 signature (X-Signature-Ed25519 + X-Signature-Timestamp)
    3. Generic: X-Webhook-Secret header (timing-safe comparison)
    """
    # Validate connector_id format (prevents log injection from arbitrary strings)
    try:
        UUID(connector_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")

    # Find connector first (needed for all auth methods)
    result = await db.execute(
        select(Connector).where(Connector.id == connector_id)
    )
    connector = result.scalar_one_or_none()

    if not connector:
        raise HTTPException(status_code=404, detail="Not found")

    # Read body once (needed for signature verification)
    body = await request.body()

    # ── Auth: Slack ───────────────────────────────────────────────────────
    if connector.connector_type == "slack":
        slack_signature = request.headers.get("X-Slack-Signature")
        slack_timestamp = request.headers.get("X-Slack-Request-Timestamp")
        if slack_signature and slack_timestamp:
            if not verify_slack_signature(
                body, slack_timestamp, slack_signature, connector.webhook_secret,
            ):
                raise HTTPException(status_code=403, detail="Invalid Slack signature")
        else:
            raise HTTPException(status_code=401, detail="Missing Slack signature headers")

    # ── Auth: Discord ────────────────────────────────────────────────────
    elif connector.connector_type == "discord":
        discord_sig = request.headers.get("X-Signature-Ed25519")
        discord_ts = request.headers.get("X-Signature-Timestamp")
        public_key = (connector.config or {}).get("public_key", "")

        if not discord_sig or not discord_ts:
            raise HTTPException(status_code=401, detail="Missing Discord signature headers")
        if not public_key:
            raise HTTPException(status_code=500, detail="Discord public_key not configured")
        if not verify_discord_signature(body, discord_sig, discord_ts, public_key):
            raise HTTPException(status_code=401, detail="Invalid Discord signature")

    # ── Auth: Generic (Teams, Email, etc.) ───────────────────────────────
    else:
        secret = request.headers.get("X-Webhook-Secret", "")
        if not secret:
            raise HTTPException(status_code=401, detail="Missing X-Webhook-Secret header")
        if not hmac.compare_digest(connector.webhook_secret, secret):
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    # Check if enabled
    if not connector.is_enabled:
        raise HTTPException(status_code=503, detail="Connector is disabled")

    # Parse payload
    try:
        payload = await request.json()
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # ── Handle Slack URL verification ────────────────────────────────────
    if connector.connector_type == "slack" and payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge")}

    # ── Handle Discord PING (type 1) — required for endpoint validation ──
    if connector.connector_type == "discord" and payload.get("type") == 1:
        return JSONResponse(content={"type": 1})

    # Extract message
    extractor = EXTRACTORS.get(connector.connector_type)
    if not extractor:
        raise HTTPException(status_code=400, detail="Unknown connector type")

    message = extractor(payload)
    if not message:
        return {"status": "ignored", "reason": "No message content extracted"}

    # ── Discord: deferred response + background execution ────────────────
    if connector.connector_type == "discord":
        application_id = (connector.config or {}).get("application_id", "")
        interaction_token = payload.get("token", "")

        if not application_id or not interaction_token:
            raise HTTPException(
                status_code=500,
                detail="Discord application_id or interaction token missing",
            )

        # Fire background task — agent runs async, result sent via followup.
        # Store task reference to prevent GC and log unhandled exceptions.
        task = asyncio.create_task(
            _run_discord_agent(
                connector.agent_id,
                connector_id,
                message,
                application_id,
                interaction_token,
            ),
            name=f"discord-agent-{connector_id[:8]}",
        )
        _discord_background_tasks.add(task)
        task.add_done_callback(_discord_background_tasks.discard)

        # Return deferred response immediately (Discord's 3-second timeout)
        return JSONResponse(content={"type": 5})

    # ── Standard execution (Slack, Teams, Email) ─────────────────────────
    exec_service = ExecutionService(db)
    try:
        execution = await exec_service.start_agent_execution(
            agent_id=connector.agent_id,
            data=ExecutionCreate(prompt=message),
            user_id=f"system:webhook:{connector_id}",
        )
        await db.commit()

        # Fair-scheduling: acquire slot before dispatch
        acquired = await fair_scheduler.acquire("webhook", execution.id)
        if not acquired:
            raise HTTPException(
                status_code=429,
                detail="Too many concurrent executions. Try again later.",
                headers={"Retry-After": "10"},
            )
        await exec_service.dispatch_execution(execution)
        await db.commit()

        # Inline execution — run synchronously for webhook response
        response_text = ""
        async for event in exec_service.execute(execution.id):
            if event.get("type") == "complete":
                output = event.get("output", {})
                response_text = output.get("response", str(output))
                break

        await db.commit()

        return {
            "status": "ok",
            "execution_id": execution.id,
            "response": response_text,
        }

    except Exception:  # Execution involves DB + Redis + LLM; logs and returns 500
        logger.exception("Webhook execution failed")
        raise HTTPException(status_code=500, detail="Execution failed")
