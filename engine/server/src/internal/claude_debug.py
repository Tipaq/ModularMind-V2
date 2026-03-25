"""Claude Bridge — Debug endpoint for Claude Code CLI via Docker sidecar.

Routes prompts to the mm-claude-bridge container using Docker SDK exec.
Only available when the sidecar is running (profile: debug).
"""

import asyncio
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
EXEC_TIMEOUT = 120


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


@router.get("/status")
async def claude_bridge_status(
    user: CurrentUser,
    _: None = Depends(require_min_role(UserRole.OWNER)),
) -> dict:
    try:
        client = _get_docker_client()
        container = _get_bridge_container(client)
        return {"available": True, "status": container.status}
    except HTTPException:
        return {"available": False, "status": "not_running"}
