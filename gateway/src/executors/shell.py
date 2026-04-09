"""Shell executor — hybrid direct/sandbox command execution."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

MAX_OUTPUT_SIZE = 1_048_576  # 1MB


async def execute_shell(
    action: str,
    args: dict[str, Any],
    sandbox_mgr: SandboxManager,
    execution_id: str,
    max_execution_seconds: int = 30,
    agent_id: str = "",
    permissions: Any = None,
) -> str:
    if action != "exec":
        return f"Unknown shell action: {action}"

    command = args.get("command", "")
    if not command:
        return "Error: command is required"

    timeout = max_execution_seconds

    try:
        if agent_id and permissions and hasattr(sandbox_mgr, "exec_hybrid"):
            exit_code, output = await asyncio.wait_for(
                sandbox_mgr.exec_hybrid(
                    agent_id=agent_id,
                    command_str=command,
                    execution_id=execution_id,
                    permissions=permissions,
                    timeout=timeout,
                ),
                timeout=timeout + 5,
            )
        else:
            exit_code, output = await asyncio.wait_for(
                sandbox_mgr.exec_in_sandbox(
                    execution_id,
                    ["sh", "-c", command],
                ),
                timeout=timeout,
            )
    except TimeoutError:
        return (
            f"Error: command timed out after {timeout}s. "
            "Consider breaking the command into smaller steps."
        )

    if len(output) > MAX_OUTPUT_SIZE:
        output = output[:MAX_OUTPUT_SIZE] + "\n... [output truncated at 1MB]"

    if exit_code != 0:
        return f"Command exited with code {exit_code}:\n{output}"
    return output
