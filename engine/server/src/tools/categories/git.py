"""Git tools — local repository operations via subprocess.

The git binary is an OPTIONAL dependency. If not installed, all tools
return a clear error directing the user to enable it in Settings.
Executes directly in the engine process via asyncio subprocess.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from typing import Any

logger = logging.getLogger(__name__)

GIT_TIMEOUT = 60
MAX_OUTPUT = 50_000
PROJECTS_DIR = os.environ.get("GIT_PROJECTS_DIR", "/data/projects")

_GIT_NOT_INSTALLED = (
    "Error: git is not installed. Enable it in Settings > System, "
    "or install it manually in the engine container."
)


def get_git_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for the git category."""
    return [
        _tool(
            "git_clone",
            "Clone a git repository into the projects directory.",
            {
                "url": _str("Repository URL (HTTPS)"),
                "directory": _str("Target directory name (optional, defaults to repo name)"),
            },
            ["url"],
        ),
        _tool(
            "git_status",
            "Show the working tree status of a repository.",
            {
                "repo": _str("Repository directory name in projects"),
            },
            ["repo"],
        ),
        _tool(
            "git_diff",
            "Show file changes in a repository.",
            {
                "repo": _str("Repository directory name"),
                "staged": {
                    "type": "boolean",
                    "description": "Show staged changes only (default: false)",
                },
                "file": _str("Specific file to diff (optional)"),
            },
            ["repo"],
        ),
        _tool(
            "git_log",
            "Show commit history.",
            {
                "repo": _str("Repository directory name"),
                "limit": _int("Number of commits to show (default: 20, max: 100)"),
                "branch": _str("Branch name (optional, defaults to current)"),
            },
            ["repo"],
        ),
        _tool(
            "git_branch",
            "List branches or create a new branch.",
            {
                "repo": _str("Repository directory name"),
                "create": _str("Name of new branch to create (optional)"),
                "all": {
                    "type": "boolean",
                    "description": "Show remote branches too (default: false)",
                },
            },
            ["repo"],
        ),
        _tool(
            "git_checkout",
            "Switch to a branch or commit.",
            {
                "repo": _str("Repository directory name"),
                "ref": _str("Branch name, tag, or commit SHA to checkout"),
            },
            ["repo", "ref"],
        ),
        _tool(
            "git_commit",
            "Stage and commit changes.",
            {
                "repo": _str("Repository directory name"),
                "message": _str("Commit message"),
                "files": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Files to stage (default: all changes)",
                },
            },
            ["repo", "message"],
        ),
        _tool(
            "git_push",
            "Push commits to remote.",
            {
                "repo": _str("Repository directory name"),
                "branch": _str("Branch to push (optional, defaults to current)"),
            },
            ["repo"],
        ),
        _tool(
            "git_pull",
            "Pull changes from remote.",
            {
                "repo": _str("Repository directory name"),
                "branch": _str("Branch to pull (optional, defaults to current)"),
            },
            ["repo"],
        ),
    ]


async def execute_git_tool(
    name: str,
    args: dict[str, Any],
    github_token: str | None = None,
) -> str:
    """Execute a git tool call."""
    if not shutil.which("git"):
        return _GIT_NOT_INSTALLED

    handler = _HANDLERS.get(name)
    if not handler:
        return f"Error: unknown git tool '{name}'"

    try:
        return await handler(args, github_token)
    except TimeoutError:
        return f"Error: git command timed out after {GIT_TIMEOUT}s."
    except Exception as e:
        logger.exception("Git tool '%s' failed", name)
        return f"Error: {e}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _repo_path(repo: str) -> str:
    """Resolve repo name to absolute path, preventing traversal."""
    safe_name = os.path.basename(repo)
    return os.path.join(PROJECTS_DIR, safe_name)


def _git_env(github_token: str | None = None) -> dict[str, str]:
    """Build environment for git subprocess."""
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "LANG": "C.UTF-8"}
    if github_token:
        env["GIT_ASKPASS"] = "echo"
        env["GIT_CONFIG_COUNT"] = "1"
        env["GIT_CONFIG_KEY_0"] = "url.https://x-access-token@github.com/.insteadOf"
        env["GIT_CONFIG_VALUE_0"] = "https://github.com/"
        env["GIT_PASSWORD"] = github_token
    return env


async def _run(
    cmd: list[str],
    cwd: str | None = None,
    env: dict[str, str] | None = None,
) -> tuple[int, str]:
    """Run a git command and return (exit_code, output)."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )
    stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=GIT_TIMEOUT)
    output = stdout.decode("utf-8", errors="replace") if stdout else ""
    if len(output) > MAX_OUTPUT:
        output = output[:MAX_OUTPUT] + "\n... [truncated]"
    return proc.returncode or 0, output


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------


async def _git_clone(args: dict, token: str | None) -> str:
    url = args.get("url", "").strip()
    if not url:
        return "Error: url is required."
    if not url.startswith(("https://", "http://")):
        return "Error: only HTTPS URLs are supported."

    directory = args.get("directory", "")
    if not directory:
        directory = url.rstrip("/").split("/")[-1].removesuffix(".git")

    target = _repo_path(directory)
    if os.path.exists(target):
        return f"Error: directory '{directory}' already exists."

    os.makedirs(PROJECTS_DIR, exist_ok=True)
    env = _git_env(token)

    if token and "github.com" in url:
        url = url.replace("https://github.com/", f"https://x-access-token:{token}@github.com/")

    code, output = await _run(["git", "clone", "--depth", "50", url, target], env=env)
    if code != 0:
        return f"Error cloning repository:\n{output}"
    return f"Cloned {url} into {directory}"


async def _git_status(args: dict, token: str | None) -> str:
    repo = _repo_path(args.get("repo", ""))
    if not os.path.isdir(repo):
        return f"Error: repository '{args.get('repo')}' not found."

    code, output = await _run(["git", "status", "--short"], cwd=repo)
    if code != 0:
        return f"Error: {output}"
    return output if output.strip() else "Working tree clean — no changes."


async def _git_diff(args: dict, token: str | None) -> str:
    repo = _repo_path(args.get("repo", ""))
    if not os.path.isdir(repo):
        return f"Error: repository '{args.get('repo')}' not found."

    cmd = ["git", "diff"]
    if args.get("staged"):
        cmd.append("--staged")
    if args.get("file"):
        cmd.append("--")
        cmd.append(args["file"])

    code, output = await _run(cmd, cwd=repo)
    if code != 0:
        return f"Error: {output}"
    return output if output.strip() else "No differences."


async def _git_log(args: dict, token: str | None) -> str:
    repo = _repo_path(args.get("repo", ""))
    if not os.path.isdir(repo):
        return f"Error: repository '{args.get('repo')}' not found."

    limit = min(max(int(args.get("limit", 20)), 1), 100)
    cmd = ["git", "log", "--oneline", f"-n{limit}", "--no-color"]
    if args.get("branch"):
        cmd.append(args["branch"])

    code, output = await _run(cmd, cwd=repo)
    if code != 0:
        return f"Error: {output}"
    return output


async def _git_branch(args: dict, token: str | None) -> str:
    repo = _repo_path(args.get("repo", ""))
    if not os.path.isdir(repo):
        return f"Error: repository '{args.get('repo')}' not found."

    if args.get("create"):
        code, output = await _run(
            ["git", "checkout", "-b", args["create"]],
            cwd=repo,
        )
        if code != 0:
            return f"Error creating branch: {output}"
        return f"Created and switched to branch '{args['create']}'"

    cmd = ["git", "branch"]
    if args.get("all"):
        cmd.append("-a")

    code, output = await _run(cmd, cwd=repo)
    if code != 0:
        return f"Error: {output}"
    return output


async def _git_checkout(args: dict, token: str | None) -> str:
    repo = _repo_path(args.get("repo", ""))
    if not os.path.isdir(repo):
        return f"Error: repository '{args.get('repo')}' not found."

    ref = args.get("ref", "").strip()
    if not ref:
        return "Error: ref is required."

    code, output = await _run(["git", "checkout", ref], cwd=repo)
    if code != 0:
        return f"Error: {output}"
    return f"Switched to '{ref}'"


async def _git_commit(args: dict, token: str | None) -> str:
    repo = _repo_path(args.get("repo", ""))
    if not os.path.isdir(repo):
        return f"Error: repository '{args.get('repo')}' not found."

    message = args.get("message", "").strip()
    if not message:
        return "Error: message is required."

    files = args.get("files", [])
    add_cmd = ["git", "add"] + (files if files else ["."])
    code, output = await _run(add_cmd, cwd=repo)
    if code != 0:
        return f"Error staging files: {output}"

    code, output = await _run(["git", "commit", "-m", message], cwd=repo)
    if code != 0:
        return f"Error committing: {output}"
    return output


async def _git_push(args: dict, token: str | None) -> str:
    repo = _repo_path(args.get("repo", ""))
    if not os.path.isdir(repo):
        return f"Error: repository '{args.get('repo')}' not found."

    env = _git_env(token)
    cmd = ["git", "push"]
    if args.get("branch"):
        cmd.extend(["origin", args["branch"]])

    code, output = await _run(cmd, cwd=repo, env=env)
    if code != 0:
        return f"Error pushing: {output}"
    return output if output.strip() else "Push successful."


async def _git_pull(args: dict, token: str | None) -> str:
    repo = _repo_path(args.get("repo", ""))
    if not os.path.isdir(repo):
        return f"Error: repository '{args.get('repo')}' not found."

    env = _git_env(token)
    cmd = ["git", "pull"]
    if args.get("branch"):
        cmd.extend(["origin", args["branch"]])

    code, output = await _run(cmd, cwd=repo, env=env)
    if code != 0:
        return f"Error pulling: {output}"
    return output if output.strip() else "Already up to date."


_HANDLERS: dict[str, Any] = {
    "git_clone": _git_clone,
    "git_status": _git_status,
    "git_diff": _git_diff,
    "git_log": _git_log,
    "git_branch": _git_branch,
    "git_checkout": _git_checkout,
    "git_commit": _git_commit,
    "git_push": _git_push,
    "git_pull": _git_pull,
}


# ---------------------------------------------------------------------------
# Definition helpers
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
