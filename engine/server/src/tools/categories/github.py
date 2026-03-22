"""GitHub tools — native API integration via httpx.

Replaces the MCP GitHub server with direct REST API calls.
PATs are stored in DB (GitHubToken model), resolved at runtime.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
GITHUB_TIMEOUT = 30.0
MAX_BODY_LENGTH = 50_000


def get_github_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for the GitHub category."""
    return [
        _tool("github_get_repo", "Get repository information.", {
            "repo": _str("Repository (owner/name format)"),
        }, ["repo"]),
        _tool("github_list_repos", "List repositories for a user or organization.", {
            "owner": _str("GitHub user or organization name"),
            "type": _str("Filter: all, owner, member (default: owner)"),
        }, ["owner"]),
        _tool("github_list_issues", "List issues for a repository.", {
            "repo": _str("Repository (owner/name format)"),
            "state": _str("Filter: open, closed, all (default: open)"),
            "labels": _str("Comma-separated label filter"),
            "per_page": _int("Results per page (max 100, default 30)"),
        }, ["repo"]),
        _tool("github_get_issue", "Get details of a specific issue.", {
            "repo": _str("Repository (owner/name format)"),
            "issue_number": _int("Issue number"),
        }, ["repo", "issue_number"]),
        _tool("github_create_issue", "Create a new issue.", {
            "repo": _str("Repository (owner/name format)"),
            "title": _str("Issue title"),
            "body": _str("Issue body (markdown)"),
            "labels": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Labels to add",
            },
        }, ["repo", "title"]),
        _tool("github_list_prs", "List pull requests for a repository.", {
            "repo": _str("Repository (owner/name format)"),
            "state": _str("Filter: open, closed, all (default: open)"),
            "per_page": _int("Results per page (max 100, default 30)"),
        }, ["repo"]),
        _tool("github_get_pr", "Get pull request details including diff.", {
            "repo": _str("Repository (owner/name format)"),
            "pr_number": _int("Pull request number"),
            "include_diff": {
                "type": "boolean",
                "description": "Include diff content (default: true)",
            },
        }, ["repo", "pr_number"]),
        _tool("github_create_pr", "Create a new pull request.", {
            "repo": _str("Repository (owner/name format)"),
            "title": _str("PR title"),
            "body": _str("PR description (markdown)"),
            "head": _str("Branch with changes"),
            "base": _str("Branch to merge into (default: main)"),
        }, ["repo", "title", "head"]),
        _tool("github_pr_comment", "Add a comment to a pull request or issue.", {
            "repo": _str("Repository (owner/name format)"),
            "number": _int("PR or issue number"),
            "body": _str("Comment body (markdown)"),
        }, ["repo", "number", "body"]),
        _tool("github_list_branches", "List branches for a repository.", {
            "repo": _str("Repository (owner/name format)"),
            "per_page": _int("Results per page (max 100, default 30)"),
        }, ["repo"]),
        _tool("github_get_file", "Read a file from a repository.", {
            "repo": _str("Repository (owner/name format)"),
            "path": _str("File path in the repository"),
            "ref": _str("Branch, tag, or commit SHA (default: main)"),
        }, ["repo", "path"]),
        _tool("github_search_code", "Search code across GitHub repositories.", {
            "query": _str("Search query (GitHub code search syntax)"),
            "per_page": _int("Results per page (max 100, default 30)"),
        }, ["query"]),
        _tool("github_search_issues", "Search issues and PRs across GitHub.", {
            "query": _str("Search query (GitHub search syntax)"),
            "per_page": _int("Results per page (max 100, default 30)"),
        }, ["query"]),
        _tool("github_list_commits", "List commits for a repository.", {
            "repo": _str("Repository (owner/name format)"),
            "sha": _str("Branch or commit SHA to list from"),
            "per_page": _int("Results per page (max 100, default 30)"),
        }, ["repo"]),
        _tool("github_merge_pr", "Merge a pull request.", {
            "repo": _str("Repository (owner/name format)"),
            "pr_number": _int("Pull request number"),
            "merge_method": _str("Merge method: merge, squash, rebase (default: squash)"),
            "commit_title": _str("Custom merge commit title"),
        }, ["repo", "pr_number"]),
    ]


async def execute_github_tool(
    name: str,
    args: dict[str, Any],
    session: AsyncSession,
    agent_id: str,
) -> str:
    """Execute a GitHub tool call."""
    token = await resolve_token(session, agent_id)
    if not token:
        return "Error: no GitHub token configured. Add one in Settings > GitHub."

    handler = _HANDLERS.get(name)
    if not handler:
        return f"Error: unknown GitHub tool '{name}'"

    try:
        return await handler(args, token)
    except httpx.HTTPStatusError as e:
        return f"GitHub API error {e.response.status_code}: {e.response.text[:500]}"
    except httpx.TimeoutException:
        return "Error: GitHub API request timed out."
    except Exception as e:
        logger.exception("GitHub tool '%s' failed", name)
        return f"Error: {e}"


# ---------------------------------------------------------------------------
# Token resolution
# ---------------------------------------------------------------------------

async def resolve_token(session: AsyncSession, agent_id: str) -> str | None:
    """Resolve the GitHub PAT for this agent."""
    from src.tools.models import GitHubToken

    result = await session.execute(
        select(GitHubToken.token_encrypted)
        .where(GitHubToken.is_default.is_(True))
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row:
        return _decrypt_token(row)

    # Fallback: any token
    result = await session.execute(
        select(GitHubToken.token_encrypted).limit(1)
    )
    row = result.scalar_one_or_none()
    return _decrypt_token(row) if row else None


def _decrypt_token(encrypted: str) -> str:
    """Decrypt a stored token. Currently plain text — TODO: add encryption."""
    return encrypted


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }


async def _get(path: str, token: str, params: dict | None = None) -> dict | list:
    async with httpx.AsyncClient(timeout=GITHUB_TIMEOUT) as client:
        resp = await client.get(
            f"{GITHUB_API}{path}", headers=_headers(token), params=params,
        )
        resp.raise_for_status()
        return resp.json()


async def _post(path: str, token: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=GITHUB_TIMEOUT) as client:
        resp = await client.post(
            f"{GITHUB_API}{path}", headers=_headers(token), json=body,
        )
        resp.raise_for_status()
        return resp.json()


async def _put(path: str, token: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=GITHUB_TIMEOUT) as client:
        resp = await client.put(
            f"{GITHUB_API}{path}", headers=_headers(token), json=body,
        )
        resp.raise_for_status()
        return resp.json()


def _fmt(data: dict | list, keys: list[str] | None = None) -> str:
    """Format API response for LLM consumption."""
    import json
    if keys and isinstance(data, dict):
        data = {k: data[k] for k in keys if k in data}
    if isinstance(data, list):
        data = [
            {k: item[k] for k in keys if k in item} if keys else item
            for item in data
        ]
    return json.dumps(data, indent=2, default=str)[:MAX_BODY_LENGTH]


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------

async def _get_repo(args: dict, token: str) -> str:
    repo = args["repo"]
    data = await _get(f"/repos/{repo}", token)
    return _fmt(data, ["full_name", "description", "language", "stargazers_count",
                        "forks_count", "open_issues_count", "default_branch",
                        "private", "html_url"])


async def _list_repos(args: dict, token: str) -> str:
    owner = args["owner"]
    params = {"type": args.get("type", "owner"), "per_page": "30"}
    data = await _get(f"/users/{owner}/repos", token, params)
    return _fmt(data, ["full_name", "description", "language", "private", "updated_at"])


async def _list_issues(args: dict, token: str) -> str:
    repo = args["repo"]
    params = {
        "state": args.get("state", "open"),
        "per_page": str(args.get("per_page", 30)),
    }
    if args.get("labels"):
        params["labels"] = args["labels"]
    data = await _get(f"/repos/{repo}/issues", token, params)
    return _fmt(data, ["number", "title", "state", "labels", "user", "created_at"])


async def _get_issue(args: dict, token: str) -> str:
    repo, num = args["repo"], args["issue_number"]
    data = await _get(f"/repos/{repo}/issues/{num}", token)
    return _fmt(data, ["number", "title", "state", "body", "labels", "user",
                        "created_at", "html_url"])


async def _create_issue(args: dict, token: str) -> str:
    repo = args["repo"]
    body = {"title": args["title"]}
    if args.get("body"):
        body["body"] = args["body"]
    if args.get("labels"):
        body["labels"] = args["labels"]
    data = await _post(f"/repos/{repo}/issues", token, body)
    return f"Issue #{data['number']} created: {data['html_url']}"


async def _list_prs(args: dict, token: str) -> str:
    repo = args["repo"]
    params = {
        "state": args.get("state", "open"),
        "per_page": str(args.get("per_page", 30)),
    }
    data = await _get(f"/repos/{repo}/pulls", token, params)
    return _fmt(data, ["number", "title", "state", "user", "head", "base",
                        "created_at", "draft"])


async def _get_pr(args: dict, token: str) -> str:
    repo, num = args["repo"], args["pr_number"]
    data = await _get(f"/repos/{repo}/pulls/{num}", token)
    result = _fmt(data, ["number", "title", "state", "body", "user",
                          "head", "base", "mergeable", "html_url",
                          "additions", "deletions", "changed_files"])

    if args.get("include_diff", True):
        async with httpx.AsyncClient(timeout=GITHUB_TIMEOUT) as client:
            diff_resp = await client.get(
                f"{GITHUB_API}/repos/{repo}/pulls/{num}",
                headers={**_headers(token), "Accept": "application/vnd.github.v3.diff"},
            )
        if diff_resp.status_code == 200:
            diff = diff_resp.text[:MAX_BODY_LENGTH]
            result += f"\n\n--- DIFF ---\n{diff}"

    return result


async def _create_pr(args: dict, token: str) -> str:
    repo = args["repo"]
    body = {
        "title": args["title"],
        "head": args["head"],
        "base": args.get("base", "main"),
    }
    if args.get("body"):
        body["body"] = args["body"]
    data = await _post(f"/repos/{repo}/pulls", token, body)
    return f"PR #{data['number']} created: {data['html_url']}"


async def _pr_comment(args: dict, token: str) -> str:
    repo, num = args["repo"], args["number"]
    data = await _post(
        f"/repos/{repo}/issues/{num}/comments", token, {"body": args["body"]},
    )
    return f"Comment posted: {data['html_url']}"


async def _list_branches(args: dict, token: str) -> str:
    repo = args["repo"]
    params = {"per_page": str(args.get("per_page", 30))}
    data = await _get(f"/repos/{repo}/branches", token, params)
    return _fmt(data, ["name", "protected"])


async def _get_file(args: dict, token: str) -> str:
    repo, path = args["repo"], args["path"]
    params = {}
    if args.get("ref"):
        params["ref"] = args["ref"]
    data = await _get(f"/repos/{repo}/contents/{path}", token, params)

    if data.get("encoding") == "base64" and data.get("content"):
        import base64
        content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        return f"File: {data['path']} ({data.get('size', 0)} bytes)\n\n{content[:MAX_BODY_LENGTH]}"

    return _fmt(data, ["name", "path", "size", "type", "html_url"])


async def _search_code(args: dict, token: str) -> str:
    params = {
        "q": args["query"],
        "per_page": str(args.get("per_page", 30)),
    }
    data = await _get("/search/code", token, params)
    items = data.get("items", [])
    return _fmt(items, ["name", "path", "repository", "html_url"])


async def _search_issues(args: dict, token: str) -> str:
    params = {
        "q": args["query"],
        "per_page": str(args.get("per_page", 30)),
    }
    data = await _get("/search/issues", token, params)
    items = data.get("items", [])
    return _fmt(items, ["number", "title", "state", "repository_url", "html_url"])


async def _list_commits(args: dict, token: str) -> str:
    repo = args["repo"]
    params = {"per_page": str(args.get("per_page", 30))}
    if args.get("sha"):
        params["sha"] = args["sha"]
    data = await _get(f"/repos/{repo}/commits", token, params)
    return _fmt([
        {
            "sha": c["sha"][:8],
            "message": c["commit"]["message"][:200],
            "author": c["commit"]["author"]["name"],
            "date": c["commit"]["author"]["date"],
        }
        for c in data
    ])


async def _merge_pr(args: dict, token: str) -> str:
    repo, num = args["repo"], args["pr_number"]
    body: dict[str, str] = {
        "merge_method": args.get("merge_method", "squash"),
    }
    if args.get("commit_title"):
        body["commit_title"] = args["commit_title"]
    data = await _put(f"/repos/{repo}/pulls/{num}/merge", token, body)
    return f"PR #{num} merged: {data.get('message', 'Success')}"


_HANDLERS: dict[str, Any] = {
    "github_get_repo": _get_repo,
    "github_list_repos": _list_repos,
    "github_list_issues": _list_issues,
    "github_get_issue": _get_issue,
    "github_create_issue": _create_issue,
    "github_list_prs": _list_prs,
    "github_get_pr": _get_pr,
    "github_create_pr": _create_pr,
    "github_pr_comment": _pr_comment,
    "github_list_branches": _list_branches,
    "github_get_file": _get_file,
    "github_search_code": _search_code,
    "github_search_issues": _search_issues,
    "github_list_commits": _list_commits,
    "github_merge_pr": _merge_pr,
}


# ---------------------------------------------------------------------------
# Definition helpers (keep file concise)
# ---------------------------------------------------------------------------

def _str(desc: str) -> dict:
    return {"type": "string", "description": desc}


def _int(desc: str) -> dict:
    return {"type": "integer", "description": desc}


def _tool(name: str, desc: str, props: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": desc,
            "parameters": {
                "type": "object",
                "properties": props,
                "required": required,
            },
        },
    }
