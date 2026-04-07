"""GatewayToolExecutor — routes tool calls to the Gateway service.

Includes circuit breaker to gracefully degrade when Gateway is down.
"""

import logging
import time
from uuid import uuid4

import httpx

logger = logging.getLogger(__name__)

GATEWAY_ROUTED_TOOLS: dict[str, tuple[str, str]] = {
    "fs_read": ("filesystem", "read"),
    "fs_read_media": ("filesystem", "read_media"),
    "fs_read_multiple": ("filesystem", "read_multiple"),
    "fs_list": ("filesystem", "list"),
    "fs_list_with_sizes": ("filesystem", "list_with_sizes"),
    "fs_tree": ("filesystem", "tree"),
    "fs_info": ("filesystem", "info"),
    "fs_search": ("filesystem", "search"),
    "fs_write": ("filesystem", "write"),
    "fs_edit": ("filesystem", "edit"),
    "fs_delete": ("filesystem", "delete"),
    "fs_move": ("filesystem", "move"),
    "fs_mkdir": ("filesystem", "mkdir"),
    "shell_exec": ("shell", "exec"),
    "net_request": ("network", "request"),
}


class GatewayToolExecutor:
    """Executes tool calls by forwarding to the Gateway service.

    Matches MCPToolExecutor.execute(name, args) -> str interface.
    """

    def __init__(
        self,
        gateway_url: str,
        agent_id: str,
        execution_id: str,
        user_id: str,
        internal_token: str,
    ):
        self._url = gateway_url.rstrip("/")
        self._agent_id = agent_id
        self._execution_id = execution_id
        self._user_id = user_id
        self._token = internal_token
        self._failure_count = 0
        self._circuit_open_until = 0.0

    async def execute(self, name: str, args: dict) -> str:
        """Execute a gateway tool call.

        Returns string result (matches MCPToolExecutor interface).
        """
        if time.time() < self._circuit_open_until:
            return "Tool error: system access tools are temporarily unavailable."

        routing = GATEWAY_ROUTED_TOOLS.get(name)
        if not routing:
            return f"Tool error: unknown gateway tool '{name}'"
        category, action = routing

        payload = {
            "request_id": str(uuid4()),
            "agent_id": self._agent_id,
            "execution_id": self._execution_id,
            "user_id": self._user_id,
            "tool": name,
            "category": category,
            "action": action,
            "args": args,
        }

        try:
            async with httpx.AsyncClient(timeout=None) as client:
                response = await client.post(
                    f"{self._url}/api/v1/execute",
                    json=payload,
                    headers={"Authorization": self._token},
                )

            self._failure_count = 0
            data = response.json()

            if data.get("status") == "denied":
                return f"Tool error: {data.get('error', 'Access denied')}"
            if data.get("status") == "error":
                return f"Tool error: {data.get('error', 'Execution failed')}"

            return data.get("result", "")

        except (httpx.ConnectError, httpx.TimeoutException) as e:
            self._failure_count += 1
            if self._failure_count >= 3:
                self._circuit_open_until = time.time() + 30
                logger.warning(
                    "Gateway circuit breaker OPEN after %d failures (30s backoff)",
                    self._failure_count,
                )
            logger.error("Gateway connection error: %s", e)
            return "Tool error: system access tools are temporarily unavailable."
