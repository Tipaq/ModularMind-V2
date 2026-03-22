"""Human interaction tools — structured prompts and notifications."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)


def get_human_interaction_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for human interaction category."""
    return [
        {
            "type": "function",
            "function": {
                "name": "human_prompt",
                "description": (
                    "Ask the user a structured question and wait for their response. "
                    "Supports confirmation (yes/no), single select, or multi-select. "
                    "The user sees a formatted prompt with clickable options."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prompt_type": {
                            "type": "string",
                            "enum": ["confirm", "select", "multi_select"],
                            "description": "Type of prompt to show.",
                        },
                        "question": {
                            "type": "string",
                            "description": "The question to ask (max 500 chars).",
                        },
                        "options": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": {"type": "string"},
                                    "value": {"type": "string"},
                                },
                                "required": ["label", "value"],
                            },
                            "description": "Options for select/multi_select (2-10 items). For confirm, omit (defaults to Yes/No).",
                        },
                    },
                    "required": ["prompt_type", "question"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "human_notify",
                "description": (
                    "Send a notification to the user. This is fire-and-forget — "
                    "it does not wait for a response. Use for status updates, "
                    "alerts, or progress information."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Notification title (max 100 chars).",
                        },
                        "body": {
                            "type": "string",
                            "description": "Notification body text (max 500 chars).",
                        },
                    },
                    "required": ["title"],
                },
            },
        },
    ]


async def execute_human_interaction_tool(
    name: str,
    args: dict[str, Any],
    publish_fn: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
) -> str:
    """Execute a human interaction tool."""
    if name == "human_prompt":
        return await _human_prompt(args, publish_fn)
    if name == "human_notify":
        return await _human_notify(args, publish_fn)
    return f"Error: unknown human interaction tool '{name}'"


async def _human_prompt(
    args: dict,
    publish_fn: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> str:
    """Send structured prompt to user and wait for response via SSE."""
    prompt_type = args.get("prompt_type", "confirm")
    question = args.get("question", "")[:500]
    options = args.get("options")

    if prompt_type == "confirm" and not options:
        options = [
            {"label": "Yes", "value": "yes"},
            {"label": "No", "value": "no"},
        ]

    if not options or len(options) < 2:
        return "Error: at least 2 options are required."

    if len(options) > 10:
        options = options[:10]

    if publish_fn:
        await publish_fn({
            "type": "human_prompt",
            "prompt_type": prompt_type,
            "question": question,
            "options": options,
        })
        return (
            f"Prompt sent to user: \"{question}\" "
            f"({prompt_type} with {len(options)} options). "
            "Waiting for their response..."
        )

    return (
        f"I need to ask the user: \"{question}\" "
        f"(options: {', '.join(o['label'] for o in options)}). "
        "However, the notification channel is not available."
    )


async def _human_notify(
    args: dict,
    publish_fn: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> str:
    """Send notification to user (fire-and-forget)."""
    title = args.get("title", "")[:100]
    body = args.get("body", "")[:500]

    if not title:
        return "Error: title is required."

    if publish_fn:
        await publish_fn({
            "type": "notification",
            "title": title,
            "body": body,
        })

    return f"Notification sent: {title}"
