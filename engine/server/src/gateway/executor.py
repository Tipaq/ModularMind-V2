"""GatewayToolExecutor — routes tool calls to the Gateway service.

Follows the Claude pattern: tool_call → check permission → if approval
needed, show card to user → wait for decision → execute or deny.

Includes circuit breaker to gracefully degrade when Gateway is down.
"""

import asyncio
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

        If the gateway returns requires_approval, wait for the user's
        decision via Redis pub/sub, then re-call with the approved ID.
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

        data = await self._call_gateway(payload)
        if data is None:
            return "Tool error: system access tools are temporarily unavailable."

        status = data.get("status", "")

        if status == "requires_approval":
            return await self._wait_and_execute(data, payload)

        if status == "denied":
            return f"Tool error: {data.get('error', 'Access denied')}"
        if status == "error":
            return f"Tool error: {data.get('error', 'Execution failed')}"

        return data.get("result", "")

    async def _wait_and_execute(
        self, approval_response: dict, original_payload: dict,
    ) -> str:
        """Wait for user approval, then re-call gateway to execute."""
        approval_id = approval_response.get("approval_id")
        if not approval_id:
            return "Tool error: approval flow failed (no approval_id)"

        logger.info(
            "Tool %s requires approval %s, waiting for user decision",
            original_payload["tool"],
            approval_id,
        )

        decision = await self._poll_approval_decision(approval_id)

        if decision == "approved":
            logger.info("Approval %s granted, executing tool", approval_id)
            payload = {**original_payload, "approved_id": approval_id}
            data = await self._call_gateway(payload)
            if data is None:
                return "Tool error: execution failed after approval."
            if data.get("status") in ("denied", "error"):
                return f"Tool error: {data.get('error', 'Execution failed')}"
            return data.get("result", "")

        logger.info("Approval %s rejected by user", approval_id)
        return "Tool error: user rejected this action."

    async def _poll_approval_decision(self, approval_id: str) -> str:
        """Subscribe to Redis for the approval decision."""
        from src.infra.redis import get_redis_client

        channel = f"gateway:decision:{approval_id}"
        r = await get_redis_client()
        try:
            pubsub = r.pubsub()
            await pubsub.subscribe(channel)
            try:
                while True:
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=2.0,
                    )
                    if msg and msg["type"] == "message":
                        raw = msg["data"]
                        return raw.decode() if isinstance(raw, bytes) else raw
                    await asyncio.sleep(0.1)
            finally:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
        finally:
            await r.aclose()

    async def _call_gateway(self, payload: dict) -> dict | None:
        """Send a request to the gateway, handling connection errors."""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self._url}/api/v1/execute",
                    json=payload,
                    headers={"Authorization": self._token},
                )
            self._failure_count = 0
            return response.json()
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            self._failure_count += 1
            if self._failure_count >= 3:
                self._circuit_open_until = time.time() + 30
                logger.warning(
                    "Gateway circuit breaker OPEN after %d failures",
                    self._failure_count,
                )
            logger.error("Gateway connection error: %s", e)
            return None
