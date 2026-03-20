"""Shell executor — hybrid direct/sandbox command execution."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from src.executors.base import BaseExecutor

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

MAX_OUTPUT_SIZE = 1_048_576  # 1MB


class ShellExecutor(BaseExecutor):
    """Execute shell commands via direct subprocess or Docker sandbox.

    Safe commands (curl, grep, cat, etc.) bypass Docker for ~10ms execution.
    Unsafe commands use the full Docker sandbox path.
    """

    def __init__(
        self,
        max_execution_seconds: int = 30,
        agent_id: str = "",
        permissions: Any = None,
    ):
        self._timeout = max_execution_seconds
        self._agent_id = agent_id
        self._permissions = permissions

    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        if action != "exec":
            return f"Unknown shell action: {action}"

        command = args.get("command", "")
        if not command:
            return "Error: command is required"

        try:
            if self._agent_id and self._permissions and hasattr(sandbox_mgr, "exec_hybrid"):
                exit_code, output = await asyncio.wait_for(
                    sandbox_mgr.exec_hybrid(
                        agent_id=self._agent_id,
                        command_str=command,
                        execution_id=execution_id,
                        permissions=self._permissions,
                        timeout=self._timeout,
                    ),
                    timeout=self._timeout + 5,
                )
            else:
                exit_code, output = await asyncio.wait_for(
                    sandbox_mgr.exec_in_sandbox(
                        execution_id,
                        ["sh", "-c", command],
                    ),
                    timeout=self._timeout,
                )
        except TimeoutError:
            return (
                f"Error: command timed out after {self._timeout}s. "
                "Consider breaking the command into smaller steps."
            )

        if len(output) > MAX_OUTPUT_SIZE:
            output = output[:MAX_OUTPUT_SIZE] + "\n... [output truncated at 1MB]"

        if exit_code != 0:
            return f"Command exited with code {exit_code}:\n{output}"
        return output
