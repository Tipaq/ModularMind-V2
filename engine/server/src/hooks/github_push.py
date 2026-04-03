"""GitHub push webhook — triggers FastCode MCP reindex for tracked repos."""

import hashlib
import hmac
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from src.infra.config import settings
from src.infra.publish import enqueue_code_reindex
from src.mcp.schemas import MCPToolCallRequest
from src.mcp.service import get_mcp_registry

logger = logging.getLogger(__name__)

github_webhook_router = APIRouter(tags=["Webhooks"])


def _verify_github_signature(payload_body: bytes, signature_header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), payload_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _parse_indexed_repos(raw_text: str) -> list[str]:
    """Extract repo names from FastCode list_indexed_repos output.

    Expected format lines like: ``  - repo_name (42 elements, 1.2 MB)``
    """
    repos: list[str] = []
    for line in raw_text.splitlines():
        line = line.strip()
        if line.startswith("- "):
            name_part = line[2:].split("(")[0].strip()
            if name_part:
                repos.append(name_part)
    return repos


async def _call_list_indexed_repos() -> list[str]:
    registry = get_mcp_registry()
    server = registry.get_server_by_name(settings.FASTCODE_MCP_SERVER_NAME)
    if not server:
        logger.warning("FastCode MCP server '%s' not registered", settings.FASTCODE_MCP_SERVER_NAME)
        return []

    client = await registry.get_client(server.id)
    result = await client.call_tool(
        MCPToolCallRequest(server_id=server.id, tool_name="list_indexed_repos")
    )
    texts = [c["text"] for c in result.content if c.get("type") == "text"]
    raw_output = "\n".join(texts)
    return _parse_indexed_repos(raw_output)


def _match_repo(full_name: str, indexed_repos: list[str]) -> str | None:
    """Match GitHub full_name (owner/repo) against FastCode indexed repo names.

    FastCode stores repos by basename (e.g., ``my-repo``), while GitHub sends
    ``owner/my-repo``. Try exact match first, then basename match.
    """
    basename = full_name.split("/")[-1]
    for indexed_name in indexed_repos:
        if indexed_name in (full_name, basename):
            return indexed_name
    return None


@github_webhook_router.post("/github")
async def receive_github_push(request: Request) -> dict[str, Any]:
    """Receive GitHub push webhook and trigger reindex if repo is tracked."""
    if not settings.GITHUB_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="GitHub webhook not configured")

    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not _verify_github_signature(body, signature, settings.GITHUB_WEBHOOK_SECRET):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = await request.json()
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from None

    repo_data = payload.get("repository", {})
    full_name = repo_data.get("full_name", "")
    clone_url = repo_data.get("clone_url", "")

    if not full_name:
        return {"status": "ignored", "reason": "no repository in payload"}

    indexed_repos = await _call_list_indexed_repos()
    matched_name = _match_repo(full_name, indexed_repos)

    if not matched_name:
        logger.info("GitHub push for '%s' — not indexed, ignoring", full_name)
        return {"status": "ignored", "reason": "repo not indexed"}

    await enqueue_code_reindex(repo_url=clone_url, repo_name=matched_name)
    logger.info("GitHub push for '%s' — reindex queued as '%s'", full_name, matched_name)
    return {"status": "reindex_queued", "repo": matched_name}
