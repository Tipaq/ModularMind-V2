"""Claude Bridge — OAuth + debug endpoints for Claude Code CLI sidecar.

Routes prompts to the mm-claude-bridge container using Docker SDK exec.
Handles OAuth authentication flow and credential sync to SecretsStore.
Only available when the sidecar is running (profile: debug).
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.auth.dependencies import CurrentUser, require_min_role
from src.auth.models import UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/debug/claude", tags=["debug"])

CONTAINER_NAME = "mm-claude-bridge"
CREDENTIALS_PATH = "/home/node/.claude/.credentials.json"


class ClaudePromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)


def _get_docker_client():
    try:
        import docker

        client = docker.from_env()
        client.ping()
        return client
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Docker daemon not available",
        ) from exc


def _get_bridge_container(client):
    try:
        container = client.containers.get(CONTAINER_NAME)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="claude-bridge container not running (start with --profile debug)",
        ) from exc
    if container.status != "running":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"claude-bridge container is {container.status}, not running",
        )
    return container


async def _exec_in_bridge(command: list[str]) -> str:
    client = _get_docker_client()
    container = _get_bridge_container(client)

    exec_id = await asyncio.to_thread(
        client.api.exec_create,
        container.id,
        command,
        stdin=False,
        tty=False,
    )
    output = await asyncio.to_thread(
        client.api.exec_start,
        exec_id,
        stream=False,
    )
    return output.decode("utf-8", errors="replace")


async def _stream_claude_exec(prompt: str) -> AsyncGenerator[str, None]:
    client = _get_docker_client()
    container = _get_bridge_container(client)

    exec_id = await asyncio.to_thread(
        client.api.exec_create,
        container.id,
        ["claude", "-p", prompt, "--output-format", "text"],
        stdin=False,
        tty=False,
    )
    stream = await asyncio.to_thread(
        client.api.exec_start,
        exec_id,
        stream=True,
    )
    for chunk in stream:
        decoded = chunk.decode("utf-8", errors="replace")
        if decoded:
            yield decoded


@router.get("/status")
async def claude_bridge_status(
    user: CurrentUser,
    _: None = Depends(require_min_role(UserRole.OWNER)),
) -> dict:
    try:
        client = _get_docker_client()
        container = _get_bridge_container(client)
    except HTTPException:
        return {"available": False, "authenticated": False, "status": "not_running"}

    try:
        auth_output = await _exec_in_bridge(["claude", "auth", "status"])
        auth_data = json.loads(auth_output)
        is_authenticated = auth_data.get("loggedIn", False)
        subscription = auth_data.get("subscriptionType")
    except Exception:
        is_authenticated = False
        subscription = None

    from src.infra.secrets import secrets_store

    has_synced_key = secrets_store.has("ANTHROPIC_API_KEY")

    return {
        "available": True,
        "authenticated": is_authenticated,
        "subscription": subscription,
        "status": container.status,
        "credentials_synced": has_synced_key,
    }


@router.post("/auth")
async def start_oauth_flow(
    user: CurrentUser,
    _: None = Depends(require_min_role(UserRole.OWNER)),
) -> dict:
    output = await _exec_in_bridge(["claude", "auth", "login", "--no-open"])
    return {"output": output.strip()}


@router.post("/sync-credentials")
async def sync_credentials(
    user: CurrentUser,
    _: None = Depends(require_min_role(UserRole.OWNER)),
) -> dict:
    raw = await _exec_in_bridge(["cat", CREDENTIALS_PATH])

    try:
        credentials = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid credentials found in bridge container",
        ) from exc

    oauth_data = credentials.get("claudeAiOauth", {})
    access_token = oauth_data.get("accessToken")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No access token found — authenticate first",
        )

    from src.infra.secrets import secrets_store

    secrets_store.set("ANTHROPIC_API_KEY", access_token)
    logger.info("Claude Bridge: synced OAuth token to ANTHROPIC_API_KEY")

    return {
        "synced": True,
        "subscription": oauth_data.get("subscriptionType"),
        "expires_at": oauth_data.get("expiresAt"),
    }


@router.post("")
async def run_claude_prompt(
    body: ClaudePromptRequest,
    user: CurrentUser,
    _: None = Depends(require_min_role(UserRole.OWNER)),
) -> StreamingResponse:
    return StreamingResponse(
        _stream_claude_exec(body.prompt),
        media_type="text/plain; charset=utf-8",
    )
