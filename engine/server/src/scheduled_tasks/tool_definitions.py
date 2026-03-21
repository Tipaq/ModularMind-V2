"""OpenAI-compatible function definitions for scheduled_task__ builtin tools."""

SCHEDULED_TASK_TOOL_NAMES = {
    "scheduled_task__list",
    "scheduled_task__get",
    "scheduled_task__create",
    "scheduled_task__update",
    "scheduled_task__toggle",
    "scheduled_task__delete",
    "scheduled_task__runs",
    "scheduled_task__trigger",
}


def get_scheduled_task_tool_definitions() -> list[dict]:
    """Return OpenAI-compatible function definitions for scheduled task tools."""
    return [
        {
            "type": "function",
            "function": {
                "name": "scheduled_task__list",
                "description": "List all scheduled tasks with their status and configuration.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "search": {
                            "type": "string",
                            "description": "Optional search query to filter by name.",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scheduled_task__get",
                "description": "Get the full details of a scheduled task by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The scheduled task ID.",
                        },
                    },
                    "required": ["id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scheduled_task__create",
                "description": (
                    "Create a new scheduled task. Provide a name and optionally "
                    "a description, config (trigger, triage, execution, post_actions, "
                    "settings), and tags."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name of the scheduled task.",
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional description.",
                        },
                        "config": {
                            "type": "object",
                            "description": (
                                "Config with keys: trigger, triage, execution, "
                                "post_actions, settings."
                            ),
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional tags.",
                        },
                    },
                    "required": ["name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scheduled_task__update",
                "description": "Update an existing scheduled task.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The scheduled task ID to update.",
                        },
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "config": {"type": "object"},
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scheduled_task__toggle",
                "description": "Enable or disable a scheduled task.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The scheduled task ID.",
                        },
                        "enabled": {
                            "type": "boolean",
                            "description": "True to enable, false to disable.",
                        },
                    },
                    "required": ["id", "enabled"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scheduled_task__delete",
                "description": "Delete a scheduled task by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The scheduled task ID to delete.",
                        },
                    },
                    "required": ["id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scheduled_task__runs",
                "description": "Get the run history of a scheduled task.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The scheduled task ID.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max runs to return (default 10).",
                        },
                    },
                    "required": ["id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scheduled_task__trigger",
                "description": "Manually trigger a scheduled task to run now.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The scheduled task ID to trigger.",
                        },
                    },
                    "required": ["id"],
                },
            },
        },
    ]
