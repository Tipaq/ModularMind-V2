"""Code search executor — grep and multi-edit in sandbox."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from .base import BaseExecutor

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

MAX_GREP_RESULTS = 500
MAX_EDITS = 50


class CodeSearchExecutor(BaseExecutor):
    """Execute code search operations in Docker sandbox."""

    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        if action == "grep":
            return await self._grep(args, sandbox_mgr, execution_id)
        if action == "multi_edit":
            return await self._multi_edit(args, sandbox_mgr, execution_id)
        return f"Unknown code_search action: {action}"

    async def _grep(
        self,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        """Regex search in workspace files."""
        pattern = args.get("pattern", "")
        if not pattern:
            return "Error: pattern is required."

        path = args.get("path", "/workspace")
        glob_filter = args.get("glob", "")
        max_results = min(max(int(args.get("max_results", 50)), 1), MAX_GREP_RESULTS)
        context = min(max(int(args.get("context", 0)), 0), 5)

        cmd_parts = ["grep", "-rn", "--color=never"]

        if context > 0:
            cmd_parts.extend([f"-C{context}"])

        if glob_filter:
            cmd_parts.extend([f"--include={glob_filter}"])

        cmd_parts.extend(["-m", str(max_results)])
        cmd_parts.extend(["-e", pattern, path])

        command = " ".join(cmd_parts)
        exit_code, output = await sandbox_mgr.exec_in_sandbox(
            execution_id, ["sh", "-c", command],
        )

        if not output or not output.strip():
            return "No matches found."

        lines = output.strip().split("\n")
        if len(lines) > max_results:
            lines = lines[:max_results]
            lines.append(f"... (truncated to {max_results} results)")

        return "\n".join(lines)

    async def _multi_edit(
        self,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        """Apply multiple text replacements to a file atomically."""
        path = args.get("path", "")
        if not path:
            return "Error: path is required."

        edits = args.get("edits", [])
        if not edits:
            return "Error: edits array is required."

        if len(edits) > MAX_EDITS:
            return f"Error: max {MAX_EDITS} edits per call."

        exit_code, content = await sandbox_mgr.exec_in_sandbox(
            execution_id, ["cat", path],
        )
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
            return "No changes made (all replacements resulted in same content)."

        import base64

        encoded = base64.b64encode(modified.encode()).decode()
        write_cmd = f"echo {encoded} | base64 -d > {path}"
        exit_code, output = await sandbox_mgr.exec_in_sandbox(
            execution_id, ["sh", "-c", write_cmd],
        )
        if exit_code != 0:
            return f"Error writing file: {output}"

        return f"Applied {len(edits)} edits to {path}."
