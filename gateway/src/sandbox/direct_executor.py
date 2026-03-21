"""Direct command executor — subprocess-based execution for safe commands.

Bypasses Docker sandbox for whitelisted commands (curl, grep, cat, etc.)
to eliminate container creation overhead. ~10ms instead of ~500ms.

Safe commands are executed in a subprocess with:
- Working directory set to agent workspace
- Restricted environment (no secrets)
- Output truncation
- Timeout enforcement
"""

from __future__ import annotations

import asyncio
import logging
import os
import shlex
from typing import Any

logger = logging.getLogger(__name__)

MAX_OUTPUT_SIZE = 1_048_576  # 1MB

DEFAULT_SAFE_COMMANDS = frozenset({
    "curl", "wget",
    "grep", "egrep", "fgrep",
    "cat", "head", "tail", "wc", "sort", "uniq",
    "ls", "find", "file", "stat", "du",
    "echo", "printf", "date", "env",
    "jq", "sed", "awk", "cut", "tr",
    "base64", "md5sum", "sha256sum",
    "mkdir", "cp", "mv", "touch", "rm",
    "tar", "gzip", "gunzip",
    "dig", "nslookup", "host",
    "python3", "pip3",
})

SAFE_ENV = {
    "HOME": "/tmp",
    "USER": "appuser",
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "LANG": "C.UTF-8",
}


class UnsafeCommandError(Exception):
    """Raised when a command binary is not in the safe whitelist."""

    def __init__(self, binary: str):
        self.binary = binary
        super().__init__(f"Command '{binary}' requires sandbox execution")


def parse_command_binary(command: str) -> str:
    """Extract the first binary from a shell command string."""
    try:
        parts = shlex.split(command)
        if not parts:
            return ""
        binary = parts[0]
        if "/" in binary:
            binary = os.path.basename(binary)
        return binary
    except ValueError:
        return command.split()[0] if command.strip() else ""


def is_safe_command(command: str, safe_commands: frozenset[str] | None = None) -> bool:
    """Check if a command uses only safe binaries."""
    allowed = safe_commands or DEFAULT_SAFE_COMMANDS
    binary = parse_command_binary(command)
    return binary in allowed


async def direct_exec(
    command: str,
    workdir: str,
    timeout: int = 30,
    safe_commands: frozenset[str] | None = None,
) -> tuple[int, str]:
    """Execute a command directly via subprocess (no Docker).

    Args:
        command: Shell command to execute.
        workdir: Working directory (agent workspace).
        timeout: Max execution time in seconds.
        safe_commands: Override safe command whitelist.

    Returns:
        Tuple of (exit_code, output_string).

    Raises:
        UnsafeCommandError: If command binary is not in whitelist.
    """
    allowed = safe_commands or DEFAULT_SAFE_COMMANDS
    binary = parse_command_binary(command)

    if binary not in allowed:
        raise UnsafeCommandError(binary)

    await asyncio.to_thread(os.makedirs, workdir, exist_ok=True)

    logger.info("[direct_exec] %s (workdir=%s)", command[:200], workdir)

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=workdir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=SAFE_ENV,
        )

        stdout, _ = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout,
        )

        output = stdout.decode("utf-8", errors="replace") if stdout else ""

        if len(output) > MAX_OUTPUT_SIZE:
            output = output[:MAX_OUTPUT_SIZE] + f"\n... (truncated to {MAX_OUTPUT_SIZE} bytes)"

        logger.info("[direct_exec] exit=%d, output=%d chars", proc.returncode or 0, len(output))
        return proc.returncode or 0, output

    except asyncio.TimeoutError:
        logger.warning("[direct_exec] timed out after %ds: %s", timeout, command[:100])
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        return 124, f"Command timed out after {timeout}s"

    except Exception as e:
        logger.exception("[direct_exec] failed: %s", command[:100])
        return 1, f"Error: {e}"
