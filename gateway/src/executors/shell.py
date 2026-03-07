"""Shell executor — run commands in Docker sandbox with timeout."""

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
    """Execute shell commands inside a sandbox container."""

    def __init__(self, max_execution_seconds: int = 30):
        self._timeout = max_execution_seconds

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

        # Truncate large output
        if len(output) > MAX_OUTPUT_SIZE:
            output = output[:MAX_OUTPUT_SIZE] + "\n... [output truncated at 1MB]"

        if exit_code != 0:
            return f"Command exited with code {exit_code}:\n{output}"
        return output
