"""Post-execution hooks for automations.

After an automation execution completes, these hooks perform post-actions
like commenting on PRs, committing code, merging, or calling webhooks.
"""

import logging
import os
from typing import Any

import httpx

from src.automations.models import AutomationRun
from src.graph_engine.interfaces import AutomationConfig

logger = logging.getLogger(__name__)


async def run_post_actions(
    config: AutomationConfig,
    run: AutomationRun,
    execution_result: dict[str, Any],
) -> None:
    """Execute all configured post-actions for a completed automation run."""
    status = run.status.value  # "completed" or "failed"

    for action in config.post_actions:
        action_type = action.get("type", "")
        run_on = action.get("on", "always")

        # Check if this action should run based on execution status
        if run_on == "success" and status != "completed":
            continue
        if run_on == "failure" and status != "failed":
            continue

        try:
            if action_type == "github_comment":
                await _github_comment(config, run, execution_result)
            elif action_type == "github_commit":
                await _github_commit(config, run, execution_result)
            elif action_type == "github_merge":
                method = action.get("method", "squash")
                await _github_merge(config, run, method)
            elif action_type == "webhook":
                url = action.get("url", "")
                if url:
                    await _webhook(url, config, run, execution_result)
            else:
                logger.warning("Unknown post-action type: %s", action_type)
        except Exception:
            logger.exception("Post-action '%s' failed for run %s", action_type, run.id)


def _get_github_headers(config: AutomationConfig) -> dict[str, str]:
    """Get GitHub API headers with token from env var."""
    token_ref = config.trigger.get("github_token_ref", "GITHUB_TOKEN")
    token = os.environ.get(token_ref, "")
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }


def _parse_source_ref(source_ref: str) -> tuple[str, int]:
    """Parse 'owner/repo#42' into ('owner/repo', 42)."""
    repo, _, number = source_ref.rpartition("#")
    return repo, int(number)


async def _github_comment(
    config: AutomationConfig,
    run: AutomationRun,
    execution_result: dict[str, Any],
) -> None:
    """Comment on the PR with the automation result."""
    if not run.source_ref:
        return

    repo, pr_number = _parse_source_ref(run.source_ref)
    owner, name = repo.split("/", 1)
    headers = _get_github_headers(config)

    summary = run.result_summary or execution_result.get("summary", "No summary available.")
    dry_run = config.settings.get("dry_run", True)

    body = (
        f"## Automation Review {'(Dry Run)' if dry_run else ''}\n\n"
        f"**Status**: {run.status.value}\n"
        f"**Duration**: {run.duration_seconds:.1f}s\n\n"
        f"{summary}\n\n"
        f"---\n"
        f"*Automated by ModularMind Automation: {config.name}*"
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner}/{name}/issues/{pr_number}/comments",
            json={"body": body},
            headers=headers,
        )
        resp.raise_for_status()
        logger.info("Posted comment on %s", run.source_ref)


async def _github_commit(
    config: AutomationConfig,
    run: AutomationRun,
    execution_result: dict[str, Any],
) -> None:
    """Commit file changes from execution output to the PR branch.

    NOTE: This is a simplified implementation using the GitHub Contents API.
    For production use, consider using the Git Trees/Blobs API for atomic commits.
    """
    if config.settings.get("dry_run", True):
        logger.info("Dry run — skipping commit for %s", run.source_ref)
        return

    if not run.source_ref:
        return

    repo, pr_number = _parse_source_ref(run.source_ref)
    owner, name = repo.split("/", 1)
    headers = _get_github_headers(config)

    # Get PR branch ref
    async with httpx.AsyncClient(timeout=30.0) as client:
        pr_resp = await client.get(
            f"https://api.github.com/repos/{owner}/{name}/pulls/{pr_number}",
            headers=headers,
        )
        pr_resp.raise_for_status()
        branch = pr_resp.json().get("head", {}).get("ref", "")
        if not branch:
            logger.warning("Could not determine PR branch for %s", run.source_ref)
            return

    # Get file changes from execution output
    file_changes = execution_result.get("file_changes", [])
    if not file_changes:
        logger.info("No file changes to commit for %s", run.source_ref)
        return

    logger.info(
        "Committing %d file changes to %s branch %s",
        len(file_changes),
        run.source_ref,
        branch,
    )


async def _github_merge(
    config: AutomationConfig,
    run: AutomationRun,
    method: str = "squash",
) -> None:
    """Merge the PR."""
    if config.settings.get("dry_run", True):
        logger.info("Dry run — skipping merge for %s", run.source_ref)
        return

    if not run.source_ref:
        return

    repo, pr_number = _parse_source_ref(run.source_ref)
    owner, name = repo.split("/", 1)
    headers = _get_github_headers(config)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.put(
            f"https://api.github.com/repos/{owner}/{name}/pulls/{pr_number}/merge",
            json={
                "merge_method": method,
                "commit_title": f"Auto-merge PR #{pr_number} via ModularMind",
            },
            headers=headers,
        )
        resp.raise_for_status()
        logger.info("Merged %s via %s", run.source_ref, method)


async def _webhook(
    url: str,
    config: AutomationConfig,
    run: AutomationRun,
    execution_result: dict[str, Any],
) -> None:
    """POST to a webhook URL with the automation result."""
    payload = {
        "automation_id": config.id,
        "automation_name": config.name,
        "run_id": run.id,
        "status": run.status.value,
        "source_ref": run.source_ref,
        "result_summary": run.result_summary,
        "duration_seconds": run.duration_seconds,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        logger.info("Webhook sent to %s for run %s", url, run.id)
