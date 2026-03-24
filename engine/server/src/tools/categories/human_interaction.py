"""Human interaction tools — structured prompts and notifications."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

HUMAN_PROMPT_TIMEOUT = 300
HUMAN_PROMPT_POLL_INTERVAL = 2.0


def get_human_interaction_tool_definitions() -> list[dict[str, Any]]:
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
                            "description": (
                                "Options for select/multi_select (2-10 items). "
                                "For confirm, omit (defaults to Yes/No)."
                            ),
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
    execution_id: str | None = None,
) -> str:
    if name == "human_prompt":
        return await _human_prompt(args, publish_fn, execution_id)
    if name == "human_notify":
        return await _human_notify(args, publish_fn)
    return f"Error: unknown human interaction tool '{name}'"


async def _human_prompt(
    args: dict,
    publish_fn: Callable[[dict[str, Any]], Awaitable[None]] | None,
    execution_id: str | None,
) -> str:
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

    prompt_id = str(uuid.uuid4())

    if publish_fn:
        await publish_fn(
            {
                "type": "human_prompt",
                "prompt_type": prompt_type,
                "question": question,
                "options": options,
                "prompt_id": prompt_id,
                "execution_id": execution_id or "",
            }
        )

    if not execution_id:
        return (
            f'I need to ask the user: "{question}" '
            f"(options: {', '.join(o['label'] for o in options)}). "
            "However, blocking is not available without execution context."
        )

    from src.infra.redis import get_redis_client

    redis_key = f"human_response:{execution_id}:{prompt_id}"

    try:
        r = await get_redis_client()
        while True:
            val = await r.get(redis_key)
            if val:
                response = val.decode() if isinstance(val, bytes) else str(val)
                await r.delete(redis_key)
                await r.aclose()
                logger.info("Human prompt %s answered: %s", prompt_id, response)
                return f"User responded: {response}"

            revoke_key = f"revoke_intent:{execution_id}"
            revoke = await r.get(revoke_key)
            revoke_value = revoke.decode() if isinstance(revoke, bytes) else str(revoke)
            if revoke and revoke_value == "cancel":
                await r.aclose()
                from src.executions.cancel import ExecutionCancelled
                raise ExecutionCancelled()

            await asyncio.sleep(HUMAN_PROMPT_POLL_INTERVAL)
    except Exception as e:
        if "ExecutionCancelled" in type(e).__name__:
            raise
        logger.error("Error polling for human response: %s", e)
        return f"Error waiting for user response: {e}"


async def _human_notify(
    args: dict,
    publish_fn: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> str:
    title = args.get("title", "")[:100]
    body = args.get("body", "")[:500]

    if not title:
        return "Error: title is required."

    if publish_fn:
        await publish_fn(
            {
                "type": "notification",
                "title": title,
                "body": body,
            }
        )

    return f"Notification sent: {title}"
