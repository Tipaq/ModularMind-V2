"""Custom tools — agents can register and execute their own tools."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def get_custom_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for custom tools management."""
    return [
        {
            "type": "function",
            "function": {
                "name": "custom_tool_register",
                "description": (
                    "Register a new custom tool that you can call later. "
                    "Supports three executor types: 'shell' (runs a command in sandbox), "
                    "'http' (calls an external API), or 'python' (runs a Python script)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Tool name (lowercase, alphanumeric + underscores, max 64 chars).",
                        },
                        "description": {
                            "type": "string",
                            "description": "What the tool does (shown to the LLM).",
                        },
                        "parameters": {
                            "type": "object",
                            "description": "JSON Schema for tool arguments.",
                        },
                        "executor_type": {
                            "type": "string",
                            "enum": ["shell", "http", "python"],
                            "description": "How to execute this tool.",
                        },
                        "executor_config": {
                            "type": "object",
                            "description": (
                                "Execution config. For 'shell': {command: '...'}. "
                                "For 'http': {url: '...', method: 'POST', headers: {}}. "
                                "For 'python': {code: '...'}."
                            ),
                        },
                    },
                    "required": ["name", "description", "executor_type", "executor_config"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "custom_tool_run",
                "description": "Execute a previously registered custom tool.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tool_name": {
                            "type": "string",
                            "description": "Name of the custom tool to run.",
                        },
                        "args": {
                            "type": "object",
                            "description": "Arguments to pass to the tool.",
                        },
                    },
                    "required": ["tool_name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "custom_tool_list",
                "description": "List all registered custom tools for this agent.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "custom_tool_update",
                "description": (
                    "Update an existing custom tool's configuration. "
                    "Only provide the fields you want to change."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tool_name": {
                            "type": "string",
                            "description": "Name of the tool to update.",
                        },
                        "description": {
                            "type": "string",
                            "description": "New description.",
                        },
                        "executor_type": {
                            "type": "string",
                            "enum": ["shell", "http", "python"],
                            "description": "New executor type.",
                        },
                        "executor_config": {
                            "type": "object",
                            "description": "New executor config.",
                        },
                        "parameters": {
                            "type": "object",
                            "description": "New parameter JSON Schema.",
                        },
                    },
                    "required": ["tool_name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "custom_tool_delete",
                "description": "Delete a registered custom tool.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tool_name": {
                            "type": "string",
                            "description": "Name of the tool to delete.",
                        },
                    },
                    "required": ["tool_name"],
                },
            },
        },
    ]


async def execute_custom_tool(
    name: str,
    args: dict[str, Any],
    agent_id: str,
    session: AsyncSession,
    gateway_executor: Any | None = None,
) -> str:
    """Execute a custom tool management operation."""
    if name == "custom_tool_register":
        return await _register(args, agent_id, session)
    if name == "custom_tool_run":
        return await _run(args, agent_id, session, gateway_executor)
    if name == "custom_tool_list":
        return await _list(agent_id, session)
    if name == "custom_tool_update":
        return await _update(args, agent_id, session)
    if name == "custom_tool_delete":
        return await _delete(args, agent_id, session)
    return f"Error: unknown custom tool command '{name}'"


async def _register(args: dict, agent_id: str, session: AsyncSession) -> str:
    """Register a new custom tool."""
    import re

    from src.tools.models import CustomTool

    tool_name = args.get("name", "").strip().lower().removeprefix("custom__")
    if not tool_name or not re.match(r"^[a-z][a-z0-9_]{0,63}$", tool_name):
        return "Error: name must be lowercase alphanumeric with underscores, 1-64 chars."

    description = args.get("description", "").strip()
    if not description:
        return "Error: description is required."

    executor_type = args.get("executor_type", "")
    if executor_type not in ("shell", "http", "python"):
        return "Error: executor_type must be 'shell', 'http', or 'python'."

    executor_config = args.get("executor_config", {})
    parameters = args.get("parameters", {})

    if executor_type == "shell" and not executor_config.get("command"):
        return "Error: shell executor requires 'command' in executor_config."
    if executor_type == "http" and not executor_config.get("url"):
        return "Error: http executor requires 'url' in executor_config."
    if executor_type == "python" and not executor_config.get("code"):
        return "Error: python executor requires 'code' in executor_config."

    existing_result = await session.execute(
        select(CustomTool)
        .where(CustomTool.agent_id == agent_id, CustomTool.name == tool_name)
    )
    existing_tool = existing_result.scalar_one_or_none()

    if existing_tool:
        existing_tool.description = description
        existing_tool.parameters = parameters
        existing_tool.executor_type = executor_type
        existing_tool.executor_config = executor_config
        existing_tool.is_active = True
        await session.commit()
        return f"Custom tool '{tool_name}' updated ({executor_type} executor)."

    tool = CustomTool(
        agent_id=agent_id,
        name=tool_name,
        description=description,
        parameters=parameters,
        executor_type=executor_type,
        executor_config=executor_config,
    )
    session.add(tool)
    await session.commit()
    return f"Custom tool '{tool_name}' registered ({executor_type} executor)."


async def _run(
    args: dict,
    agent_id: str,
    session: AsyncSession,
    gateway_executor: Any | None,
) -> str:
    """Execute a custom tool."""
    from src.tools.models import CustomTool

    tool_name = args.get("tool_name", "").strip().lower().removeprefix("custom__")
    if not tool_name:
        return "Error: tool_name is required."

    tool_args = args.get("args", {})

    result = await session.execute(
        select(CustomTool)
        .where(CustomTool.agent_id == agent_id, CustomTool.name == tool_name, CustomTool.is_active.is_(True))
    )
    tool = result.scalar_one_or_none()
    if not tool:
        return f"Error: tool '{tool_name}' not found or inactive."

    if tool.executor_type == "shell":
        return await _run_shell(tool, tool_args, gateway_executor)
    if tool.executor_type == "http":
        return await _run_http(tool, tool_args)
    if tool.executor_type == "python":
        return await _run_python(tool, tool_args, gateway_executor)

    return f"Error: unsupported executor type '{tool.executor_type}'."


async def _run_shell(tool: Any, tool_args: dict, gateway_executor: Any | None) -> str:
    """Execute custom tool via gateway shell."""
    if not gateway_executor:
        return "Error: shell execution requires gateway (not available)."

    command = tool.executor_config.get("command", "")
    for key, value in tool_args.items():
        command = command.replace(f"{{{key}}}", str(value))

    return await gateway_executor.execute("gateway__shell_exec", {"command": command})


async def _run_http(tool: Any, tool_args: dict) -> str:
    """Execute custom tool via HTTP request."""
    import httpx

    config = tool.executor_config
    url = config.get("url", "")
    method = config.get("method", "POST").upper()
    headers = config.get("headers", {})

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.request(
                method, url, headers=headers, json=tool_args if tool_args else None,
            )
            status = response.status_code
            body = response.text[:5000]

            if status < 400:
                return (
                    f"HTTP {status} OK — {method} {url}\n"
                    f"Content-Type: {response.headers.get('content-type', 'unknown')}\n"
                    f"Content-Length: {len(response.content)} bytes\n"
                    f"Response (first 5000 chars):\n{body}"
                )
            return f"HTTP {status} Error — {method} {url}\nBody: {body}"
    except Exception as e:
        return f"Error: HTTP request to {url} failed: {e}"


async def _run_python(tool: Any, tool_args: dict, gateway_executor: Any | None) -> str:
    """Execute custom tool via Python code in sandbox."""
    if not gateway_executor:
        return "Error: Python execution requires gateway (not available)."

    code = tool.executor_config.get("code", "")
    args_json = json.dumps(tool_args)

    wrapper = (
        f"import json, sys\n"
        f"args = json.loads('{args_json}')\n"
        f"{code}\n"
    )

    import base64

    encoded = base64.b64encode(wrapper.encode()).decode()
    command = f"echo {encoded} | base64 -d | python3"
    return await gateway_executor.execute("gateway__shell_exec", {"command": command})


async def _update(args: dict, agent_id: str, session: AsyncSession) -> str:
    """Update an existing custom tool."""
    from src.tools.models import CustomTool

    tool_name = args.get("tool_name", "").strip().lower().removeprefix("custom__")
    if not tool_name:
        return "Error: tool_name is required."

    result = await session.execute(
        select(CustomTool)
        .where(CustomTool.agent_id == agent_id, CustomTool.name == tool_name)
    )
    tool = result.scalar_one_or_none()
    if not tool:
        return f"Error: tool '{tool_name}' not found."

    updated_fields = []
    if "description" in args:
        tool.description = args["description"]
        updated_fields.append("description")
    if "executor_type" in args:
        tool.executor_type = args["executor_type"]
        updated_fields.append("executor_type")
    if "executor_config" in args:
        tool.executor_config = args["executor_config"]
        updated_fields.append("executor_config")
    if "parameters" in args:
        tool.parameters = args["parameters"]
        updated_fields.append("parameters")

    if not updated_fields:
        return f"No changes provided for tool '{tool_name}'."

    await session.commit()
    return f"Custom tool '{tool_name}' updated: {', '.join(updated_fields)}."


async def _list(agent_id: str, session: AsyncSession) -> str:
    """List all custom tools for agent."""
    from src.tools.models import CustomTool

    result = await session.execute(
        select(CustomTool)
        .where(CustomTool.agent_id == agent_id)
        .order_by(CustomTool.created_at.desc())
    )
    tools = list(result.scalars().all())

    if not tools:
        return "No custom tools registered."

    parts = []
    for t in tools:
        status = "active" if t.is_active else "inactive"
        parts.append(
            f"- **{t.name}** ({t.executor_type}, {status}): {t.description}"
        )
    return "\n".join(parts)


async def _delete(args: dict, agent_id: str, session: AsyncSession) -> str:
    """Delete a custom tool."""
    from src.tools.models import CustomTool

    tool_name = args.get("tool_name", "").strip().lower().removeprefix("custom__")
    if not tool_name:
        return "Error: tool_name is required."

    result = await session.execute(
        select(CustomTool)
        .where(CustomTool.agent_id == agent_id, CustomTool.name == tool_name)
    )
    tool = result.scalar_one_or_none()
    if not tool:
        return f"Error: tool '{tool_name}' not found."

    await session.delete(tool)
    await session.commit()
    return f"Custom tool '{tool_name}' deleted."
