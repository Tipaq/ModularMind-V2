"""Filesystem executor — read, write, list, delete via Docker exec."""

from __future__ import annotations

import logging
import shlex
from typing import TYPE_CHECKING, Any

from src.executors.base import BaseExecutor

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

MAX_READ_SIZE = 10_485_760  # 10MB
MAX_LIST_ENTRIES = 500


class FilesystemExecutor(BaseExecutor):
    """Execute filesystem operations inside a sandbox container."""

    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        if action == "read":
            return await self._read(args, sandbox_mgr, execution_id)
        elif action == "write":
            return await self._write(args, sandbox_mgr, execution_id)
        elif action == "list":
            return await self._list(args, sandbox_mgr, execution_id)
        elif action == "delete":
            return await self._delete(args, sandbox_mgr, execution_id)
        else:
            return f"Unknown filesystem action: {action}"

    async def _read(
        self, args: dict, sandbox_mgr: SandboxManager, execution_id: str
    ) -> str:
        """Read a file from the sandbox."""
        path = args.get("path", "")
        if not path:
            return "Error: path is required"

        exit_code, output = await sandbox_mgr.exec_in_sandbox(
            execution_id, ["cat", path],
        )

        if exit_code != 0:
            return f"Error reading file: {output.strip()}"

        if len(output) > MAX_READ_SIZE:
            return output[:MAX_READ_SIZE] + "\n... [truncated]"
        return output

    async def _write(
        self, args: dict, sandbox_mgr: SandboxManager, execution_id: str
    ) -> str:
        """Write content to a file in the sandbox."""
        path = args.get("path", "")
        content = args.get("content", "")
        if not path:
            return "Error: path is required"

        # Ensure parent directory exists
        parent = "/".join(path.split("/")[:-1])
        if parent:
            await sandbox_mgr.exec_in_sandbox(
                execution_id, ["mkdir", "-p", parent],
            )

        # Write using printf with shell escaping
        escaped = content.replace("\\", "\\\\").replace("'", "'\\''")
        exit_code, output = await sandbox_mgr.exec_in_sandbox(
            execution_id,
            ["sh", "-c", f"printf '%s' '{escaped}' > {shlex.quote(path)}"],
        )

        if exit_code != 0:
            return f"Error writing file: {output.strip()}"

        return f"File written: {path} ({len(content)} bytes)"

    async def _list(
        self, args: dict, sandbox_mgr: SandboxManager, execution_id: str
    ) -> str:
        """List files in a directory."""
        path = args.get("path", "/workspace")
        recursive = args.get("recursive", False)

        if recursive:
            cmd = ["find", path, "-maxdepth", "3", "-type", "f"]
        else:
            cmd = ["ls", "-la", path]

        exit_code, output = await sandbox_mgr.exec_in_sandbox(execution_id, cmd)

        if exit_code != 0:
            return f"Error listing directory: {output.strip()}"

        lines = output.strip().split("\n")
        if len(lines) > MAX_LIST_ENTRIES:
            lines = lines[:MAX_LIST_ENTRIES]
            lines.append(f"... [{len(lines)} more entries truncated]")

        return "\n".join(lines)

    async def _delete(
        self, args: dict, sandbox_mgr: SandboxManager, execution_id: str
    ) -> str:
        """Delete a file from the sandbox."""
        path = args.get("path", "")
        if not path:
            return "Error: path is required"

        # Safety: never allow deleting /workspace root
        if path.rstrip("/") == "/workspace":
            return "Error: cannot delete workspace root"

        exit_code, output = await sandbox_mgr.exec_in_sandbox(
            execution_id, ["rm", "-f", path],
        )

        if exit_code != 0:
            return f"Error deleting file: {output.strip()}"

        return f"File deleted: {path}"
