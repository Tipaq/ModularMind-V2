"""GitHub PR source handler — fetches open PRs via GitHub MCP server.

Uses the MCP GitHub server (@modelcontextprotocol/server-github) to list
and fetch PR details. The GitHub token is resolved from an env var reference
stored in the automation config (never stored directly in DB).
"""

import logging
import os
from typing import Any

from src.graph_engine.interfaces import AutomationConfig

logger = logging.getLogger(__name__)


class GitHubPRSource:
    """Fetches new open PRs from configured repositories."""

    def __init__(self, config: AutomationConfig):
        self._config = config
        self._trigger = config.trigger
        self._settings = config.settings

    async def fetch_new_items(self) -> list[dict[str, Any]]:
        """Fetch open PRs that haven't been processed yet.

        Returns a list of items with: source_ref, title, body, diff, files, repo, prompt.
        """
        token_ref = self._trigger.get("github_token_ref", "GITHUB_TOKEN")
        token = os.environ.get(token_ref, "")
        if not token:
            logger.error("GitHub token env var '%s' not set", token_ref)
            return []

        repos = self._trigger.get("repos", [])
        if not repos:
            logger.warning("No repositories configured for automation %s", self._config.id)
            return []

        skip_labels = set(self._settings.get("skip_labels", []))
        require_labels = set(self._settings.get("require_labels", []))
        branches = set(self._settings.get("branches", []))

        items = []
        for repo in repos:
            try:
                repo_items = await self._fetch_repo_prs(
                    repo,
                    token,
                    skip_labels,
                    require_labels,
                    branches,
                )
                items.extend(repo_items)
            except Exception:
                logger.exception("Failed to fetch PRs from %s", repo)

        return items

    async def _fetch_repo_prs(
        self,
        repo: str,
        token: str,
        skip_labels: set[str],
        require_labels: set[str],
        branches: set[str],
    ) -> list[dict[str, Any]]:
        """Fetch PRs for a single repo via GitHub API."""
        import httpx

        owner, name = repo.split("/", 1)
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
        }

        items = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            # List open PRs
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{name}/pulls",
                params={"state": "open", "per_page": "30"},
                headers=headers,
            )
            resp.raise_for_status()
            prs = resp.json()

            # Check already-processed PRs
            processed = await self._get_processed_refs(self._config.id)

            for pr in prs:
                pr_number = pr["number"]
                source_ref = f"{repo}#{pr_number}"

                # Skip already processed
                if source_ref in processed:
                    continue

                # Filter by labels
                pr_labels = {lbl["name"] for lbl in pr.get("labels", [])}
                if skip_labels & pr_labels:
                    continue
                if require_labels and not require_labels.issubset(pr_labels):
                    continue

                # Filter by target branch
                base_branch = pr.get("base", {}).get("ref", "")
                if branches and base_branch not in branches:
                    continue

                # Fetch diff
                diff_resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{name}/pulls/{pr_number}",
                    headers={**headers, "Accept": "application/vnd.github.v3.diff"},
                )
                diff = diff_resp.text if diff_resp.status_code == 200 else ""

                # Fetch files
                files_resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{name}/pulls/{pr_number}/files",
                    headers=headers,
                )
                files = files_resp.json() if files_resp.status_code == 200 else []

                items.append(
                    {
                        "source_ref": source_ref,
                        "repo": repo,
                        "pr_number": pr_number,
                        "title": pr.get("title", ""),
                        "body": pr.get("body", "") or "",
                        "diff": diff[:50000],  # Truncate very large diffs
                        "files": [
                            {
                                "filename": f.get("filename", ""),
                                "status": f.get("status", ""),
                                "additions": f.get("additions", 0),
                                "deletions": f.get("deletions", 0),
                            }
                            for f in files[:100]
                        ],
                        "file_count": len(files),
                        "prompt": self._build_prompt(pr, repo, diff, files),
                    }
                )

        return items

    async def _get_processed_refs(self, automation_id: str) -> set[str]:
        """Get source_refs already processed by this automation."""
        try:
            from sqlalchemy import select

            from src.automations.models import AutomationRun
            from src.infra.database import async_session_maker

            async with async_session_maker() as session:
                result = await session.execute(
                    select(AutomationRun.source_ref).where(
                        AutomationRun.automation_id == automation_id
                    )
                )
                return {row[0] for row in result.all()}
        except Exception:
            logger.warning("Failed to load processed refs for %s", automation_id)
            return set()

    def _build_prompt(
        self,
        pr: dict,
        repo: str,
        diff: str,
        files: list,
    ) -> str:
        """Build a prompt for the execution agent/graph."""
        file_list = "\n".join(
            f"  - {f.get('filename', '')} (+{f.get('additions', 0)}/-{f.get('deletions', 0)})"
            for f in files[:30]
        )
        return (
            f"Review and resolve PR #{pr['number']} in {repo}:\n"
            f"Title: {pr.get('title', '')}\n"
            f"Description: {(pr.get('body', '') or '')[:1000]}\n\n"
            f"Files changed ({len(files)}):\n{file_list}\n\n"
            f"Diff:\n```\n{diff[:20000]}\n```\n\n"
            f"Please analyze this PR, apply the necessary changes, "
            f"run tests, and provide a summary of your review."
        )
