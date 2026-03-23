"""Filesystem executor — unified file operations with hybrid execution.

Safe operations (read, list, search, metadata) use direct subprocess when
SANDBOX_DIRECT_EXEC is enabled. Critical operations (write, edit, delete,
move, mkdir) always go through the Docker sandbox.

Replaces the previous FilesystemExecutor (4 actions) + CodeSearchExecutor
(2 actions) with a single executor handling 13 actions.
"""

from __future__ import annotations

import base64
import logging
import shlex
from typing import TYPE_CHECKING, Any

from src.executors.base import BaseExecutor

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

MAX_READ_SIZE = 10_485_760  # 10MB
MAX_LIST_ENTRIES = 500
MAX_GREP_RESULTS = 500
MAX_EDITS = 50
MAX_BATCH_FILES = 20

SAFE_ACTIONS = frozenset(
    {
        "read",
        "read_media",
        "read_multiple",
        "list",
        "list_with_sizes",
        "tree",
        "info",
        "search",
    }
)


class FilesystemExecutor(BaseExecutor):
    """Execute filesystem operations via hybrid direct/sandbox path."""

    def __init__(
        self,
        agent_id: str = "",
        permissions: Any = None,
    ):
        self._agent_id = agent_id
        self._permissions = permissions

    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        handler = {
            "read": self._read,
            "read_media": self._read_media,
            "read_multiple": self._read_multiple,
            "list": self._list,
            "list_with_sizes": self._list_with_sizes,
            "tree": self._tree,
            "info": self._info,
            "search": self._search,
            "write": self._write,
            "edit": self._edit,
            "delete": self._delete,
            "move": self._move,
            "mkdir": self._mkdir,
        }.get(action)
        if not handler:
            return f"Unknown filesystem action: {action}"
        return await handler(args, sandbox_mgr, execution_id)

    # -----------------------------------------------------------------
    # Execution helpers
    # -----------------------------------------------------------------

    async def _exec(
        self,
        sandbox_mgr: SandboxManager,
        execution_id: str,
        command: str | list[str],
        is_safe: bool = False,
    ) -> tuple[int, str]:
        """Run a command via hybrid (safe) or sandbox (critical) path."""
        cmd_str = command if isinstance(command, str) else " ".join(command)

        if is_safe and self._agent_id and self._permissions:
            if hasattr(sandbox_mgr, "exec_hybrid"):
                return await sandbox_mgr.exec_hybrid(
                    agent_id=self._agent_id,
                    command_str=cmd_str,
                    execution_id=execution_id,
                    permissions=self._permissions,
                    timeout=30,
                )

        cmd_list = ["sh", "-c", cmd_str] if isinstance(command, str) else command
        return await sandbox_mgr.exec_in_sandbox(execution_id, cmd_list)

    # -----------------------------------------------------------------
    # Safe actions (read-only, non-destructive)
    # -----------------------------------------------------------------

    async def _read(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "")
        if not path:
            return "Error: path is required."

        head = args.get("head")
        tail = args.get("tail")

        if head:
            cmd = f"head -n {int(head)} {shlex.quote(path)}"
        elif tail:
            cmd = f"tail -n {int(tail)} {shlex.quote(path)}"
        else:
            cmd = f"cat {shlex.quote(path)}"

        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd, is_safe=True)
        if exit_code != 0:
            return f"Error reading file: {output.strip()}"
        if len(output) > MAX_READ_SIZE:
            return output[:MAX_READ_SIZE] + "\n... [truncated]"
        return output

    async def _read_media(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "")
        if not path:
            return "Error: path is required."

        cmd = f"base64 {shlex.quote(path)}"
        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd, is_safe=True)
        if exit_code != 0:
            return f"Error reading media file: {output.strip()}"

        mime_cmd = f"file --mime-type -b {shlex.quote(path)}"
        _, mime = await self._exec(sandbox_mgr, execution_id, mime_cmd, is_safe=True)

        return f"data:{mime.strip()};base64,{output.strip()}"

    async def _read_multiple(
        self, args: dict, sandbox_mgr: SandboxManager, execution_id: str
    ) -> str:
        paths = args.get("paths", [])
        if not paths:
            return "Error: paths array is required."
        if len(paths) > MAX_BATCH_FILES:
            return f"Error: max {MAX_BATCH_FILES} files per call."

        results = []
        for file_path in paths:
            cmd = f"cat {shlex.quote(file_path)}"
            exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd, is_safe=True)
            if exit_code != 0:
                results.append(f"--- {file_path} ---\nError: {output.strip()}")
            else:
                content = output[:MAX_READ_SIZE] if len(output) > MAX_READ_SIZE else output
                results.append(f"--- {file_path} ---\n{content}")

        return "\n\n".join(results)

    async def _list(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "/workspace")
        recursive = args.get("recursive", False)

        if recursive:
            cmd = f"find {shlex.quote(path)} -maxdepth 3 -type f"
        else:
            cmd = f"ls -la {shlex.quote(path)}"

        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd, is_safe=True)
        if exit_code != 0:
            return f"Error listing directory: {output.strip()}"
        return _truncate_lines(output, MAX_LIST_ENTRIES)

    async def _list_with_sizes(
        self, args: dict, sandbox_mgr: SandboxManager, execution_id: str
    ) -> str:
        path = args.get("path", "/workspace")
        sort = args.get("sort", "name")

        sort_flag = {"size": "-lS", "time": "-lt", "name": "-l"}.get(sort, "-l")
        cmd = f"ls {sort_flag} {shlex.quote(path)}"

        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd, is_safe=True)
        if exit_code != 0:
            return f"Error listing directory: {output.strip()}"
        return _truncate_lines(output, MAX_LIST_ENTRIES)

    async def _tree(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "/workspace")
        max_depth = min(max(int(args.get("max_depth", 3)), 1), 5)
        excludes = args.get("exclude", [])

        prune_parts = []
        for pattern in excludes[:10]:
            prune_parts.append(f"-name {shlex.quote(pattern)} -prune -o")

        prune = " ".join(prune_parts)
        cmd = f"find {shlex.quote(path)} -maxdepth {max_depth} {prune} -print"

        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd, is_safe=True)
        if exit_code != 0:
            return f"Error building tree: {output.strip()}"
        return _truncate_lines(output, MAX_LIST_ENTRIES)

    async def _info(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "")
        if not path:
            return "Error: path is required."

        cmd = f"stat {shlex.quote(path)}"
        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd, is_safe=True)
        if exit_code != 0:
            return f"Error getting file info: {output.strip()}"
        return output

    async def _search(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        pattern = args.get("pattern", "")
        if not pattern:
            return "Error: pattern is required."

        path = args.get("path", "/workspace")
        glob_filter = args.get("glob", "")
        max_results = min(max(int(args.get("max_results", 50)), 1), MAX_GREP_RESULTS)
        context = min(max(int(args.get("context", 0)), 0), 5)

        cmd_parts = ["grep", "-rn", "--color=never"]
        if context > 0:
            cmd_parts.append(f"-C{context}")
        if glob_filter:
            cmd_parts.append(f"--include={shlex.quote(glob_filter)}")
        cmd_parts.extend(["-m", str(max_results)])
        cmd_parts.extend(["-e", shlex.quote(pattern), shlex.quote(path)])

        cmd = " ".join(cmd_parts)
        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd, is_safe=True)

        if not output or not output.strip():
            return "No matches found."

        return _truncate_lines(output, max_results)

    # -----------------------------------------------------------------
    # Critical actions (write / destructive — always sandbox)
    # -----------------------------------------------------------------

    async def _write(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "")
        content = args.get("content", "")
        if not path:
            return "Error: path is required."

        parent = "/".join(path.split("/")[:-1])
        if parent:
            await self._exec(
                sandbox_mgr,
                execution_id,
                f"mkdir -p {shlex.quote(parent)}",
            )

        escaped = content.replace("\\", "\\\\").replace("'", "'\\''")
        cmd = f"printf '%s' '{escaped}' > {shlex.quote(path)}"
        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd)
        if exit_code != 0:
            return f"Error writing file: {output.strip()}"
        return f"File written: {path} ({len(content)} bytes)"

    async def _edit(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "")
        if not path:
            return "Error: path is required."

        edits = args.get("edits", [])
        if not edits:
            return "Error: edits array is required."
        if len(edits) > MAX_EDITS:
            return f"Error: max {MAX_EDITS} edits per call."

        dry_run = args.get("dry_run", False)

        exit_code, content = await self._exec(sandbox_mgr, execution_id, f"cat {shlex.quote(path)}")
        if exit_code != 0:
            return f"Error reading file: {content}"

        original = content
        modified = content

        for i, edit in enumerate(edits):
            old_text = edit.get("old_text", "")
            new_text = edit.get("new_text", "")
            if not old_text:
                return f"Error: edit {i} missing old_text."
            if old_text not in modified:
                return f"Error: edit {i} old_text not found in file."
            modified = modified.replace(old_text, new_text, 1)

        if modified == original:
            return "No changes made (replacements resulted in same content)."

        if dry_run:
            return f"Dry run: {len(edits)} edits would be applied to {path}."

        encoded = base64.b64encode(modified.encode()).decode()
        write_cmd = f"echo {encoded} | base64 -d > {shlex.quote(path)}"
        exit_code, output = await self._exec(sandbox_mgr, execution_id, write_cmd)
        if exit_code != 0:
            return f"Error writing file: {output}"
        return f"Applied {len(edits)} edits to {path}."

    async def _delete(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "")
        if not path:
            return "Error: path is required."
        if path.rstrip("/") == "/workspace":
            return "Error: cannot delete workspace root."

        exit_code, output = await self._exec(
            sandbox_mgr,
            execution_id,
            f"rm -f {shlex.quote(path)}",
        )
        if exit_code != 0:
            return f"Error deleting file: {output.strip()}"
        return f"File deleted: {path}"

    async def _move(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        source = args.get("source", "")
        destination = args.get("destination", "")
        if not source or not destination:
            return "Error: source and destination are required."

        cmd = f"mv {shlex.quote(source)} {shlex.quote(destination)}"
        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd)
        if exit_code != 0:
            return f"Error moving file: {output.strip()}"
        return f"Moved: {source} → {destination}"

    async def _mkdir(self, args: dict, sandbox_mgr: SandboxManager, execution_id: str) -> str:
        path = args.get("path", "")
        if not path:
            return "Error: path is required."

        cmd = f"mkdir -p {shlex.quote(path)}"
        exit_code, output = await self._exec(sandbox_mgr, execution_id, cmd)
        if exit_code != 0:
            return f"Error creating directory: {output.strip()}"
        return f"Directory created: {path}"


def _truncate_lines(output: str, max_lines: int) -> str:
    """Truncate output to a maximum number of lines."""
    lines = output.strip().split("\n")
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines.append(f"... (truncated to {max_lines} results)")
    return "\n".join(lines)
