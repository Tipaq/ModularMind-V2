"""Worker handler for code reindex tasks via FastCode MCP."""

import logging
from typing import Any

from src.infra.config import settings
from src.mcp.schemas import MCPToolCallRequest
from src.mcp.sdk_client import MCPClientError

logger = logging.getLogger(__name__)


async def code_reindex_handler(data: dict[str, Any]) -> None:
    """Consume tasks:code_index stream — call FastCode reindex_repo via MCP.

    Raises on failure to trigger retry via RedisStreamBus (max_retries=3).
    """
    repo_url = data.get("repo_url", "")
    repo_name = data.get("repo_name", "")

    if not repo_url:
        logger.error("code_reindex_handler: missing repo_url in payload")
        return

    from src.mcp.service import get_mcp_registry

    registry = get_mcp_registry()
    server = registry.get_server_by_name(settings.FASTCODE_MCP_SERVER_NAME)
    if not server:
        logger.warning(
            "FastCode MCP server '%s' not registered — skipping reindex for '%s'",
            settings.FASTCODE_MCP_SERVER_NAME,
            repo_name,
        )
        return

    logger.info("Reindexing repo '%s' via FastCode MCP", repo_name)
    try:
        client = await registry.get_client(server.id)
        result = await client.call_tool(
            MCPToolCallRequest(
                server_id=server.id,
                tool_name="reindex_repo",
                arguments={"repo_source": repo_url},
            )
        )

        texts = [c["text"] for c in result.content if c.get("type") == "text"]
        output = "\n".join(texts)

        if result.is_error:
            raise MCPClientError(f"reindex_repo returned error: {output}")

        logger.info("Reindex complete for '%s': %s", repo_name, output)
    except MCPClientError:
        raise
    except Exception as exc:
        logger.error("Failed to reindex '%s': %s", repo_name, exc)
        raise MCPClientError(f"Reindex failed for '{repo_name}': {exc}") from exc
