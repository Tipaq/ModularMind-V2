"""Project-scoped MCP tool executor for FastCode.

Wraps ``MCPToolExecutor`` to intercept FastCode tool calls and
inject or filter the ``repos`` parameter based on the project's
configured repositories. Uses duck typing — same ``execute(name, args)``
interface as ``MCPToolExecutor``.
"""

import logging
from typing import Any

from .tool_adapter import MCPToolExecutor

logger = logging.getLogger(__name__)

REPO_LIST_TOOLS = {"code_qa", "search_symbol", "get_file_summary", "get_call_chain"}
SINGLE_REPO_TOOLS = {"get_repo_structure", "delete_repo_metadata"}


class ScopedMCPToolExecutor:
    """Intercepts FastCode MCP calls to enforce project-level repo scoping.

    For tools that accept ``repos: list[str]``:
      - If the LLM omits ``repos``, inject all project repos.
      - If the LLM provides ``repos``, intersect with allowed repos.

    For tools that accept ``repo_name: str``:
      - Validate the repo name belongs to the project.

    Handles name format mismatch: DB stores ``owner/repo`` but FastCode
    indexes under just ``repo``. Accepts both formats and normalizes to
    the short name (after ``/``) for FastCode calls.
    """

    def __init__(
        self,
        inner: MCPToolExecutor,
        project_repos: list[str],
        fastcode_server_id: str,
    ):
        self._inner = inner
        self._project_repos = project_repos
        self._allowed_set = set(project_repos)
        self._fastcode_server_id = fastcode_server_id
        self._short_names = {r.split("/")[-1] for r in project_repos}
        self._short_to_full: dict[str, str] = {
            r.split("/")[-1]: r for r in project_repos
        }

    def _is_fastcode_tool(self, namespaced_name: str) -> tuple[bool, str]:
        """Check if a namespaced tool belongs to FastCode. Returns (is_match, real_name)."""
        mapping = self._inner._map.get(namespaced_name)
        if not mapping:
            return False, ""
        server_id, real_name = mapping
        return server_id == self._fastcode_server_id, real_name

    def _resolve_name(self, name: str) -> str | None:
        """Resolve a repo name to an allowed identifier (short or full)."""
        if name in self._allowed_set:
            return name
        if name in self._short_names:
            return self._short_to_full.get(name, name)
        return None

    def _to_short_name(self, name: str) -> str:
        """Convert ``owner/repo`` to ``repo`` for FastCode compatibility."""
        return name.split("/")[-1]

    def _scope_repo_list(self, arguments: dict[str, Any]) -> dict[str, Any]:
        """Inject or filter the ``repos`` argument."""
        repos = arguments.get("repos")
        if not repos:
            arguments["repos"] = [self._to_short_name(r) for r in self._project_repos]
            return arguments

        resolved: list[str] = []
        for r in repos:
            if self._resolve_name(r) is not None:
                resolved.append(self._to_short_name(r))
        if not resolved:
            raise _RepoScopeError(
                "None of the requested repos belong to this project. "
                f"Allowed: {self._project_repos}"
            )
        arguments["repos"] = resolved
        return arguments

    def _scope_single_repo(self, arguments: dict[str, Any]) -> dict[str, Any]:
        """Validate and normalize the ``repo_name`` argument."""
        repo_name = arguments.get("repo_name", "")
        if not repo_name:
            return arguments
        if self._resolve_name(repo_name) is None:
            raise _RepoScopeError(
                f"Repository '{repo_name}' is not part of this project. "
                f"Allowed: {self._project_repos}"
            )
        arguments["repo_name"] = self._to_short_name(repo_name)
        return arguments

    async def execute(self, namespaced_name: str, arguments: dict[str, Any]) -> str:
        is_fastcode, real_name = self._is_fastcode_tool(namespaced_name)

        if is_fastcode:
            try:
                if real_name in REPO_LIST_TOOLS:
                    arguments = self._scope_repo_list(arguments)
                elif real_name in SINGLE_REPO_TOOLS:
                    arguments = self._scope_single_repo(arguments)
            except _RepoScopeError as exc:
                return str(exc)

        return await self._inner.execute(namespaced_name, arguments)


class _RepoScopeError(Exception):
    """Raised when repo scoping validation fails."""
