"""OpenAI-compatible function definitions for automation__ builtin tools."""

AUTOMATION_TOOL_NAMES = {
    "automation__list",
    "automation__get",
    "automation__create",
    "automation__update",
    "automation__toggle",
    "automation__delete",
    "automation__runs",
    "automation__trigger",
}


def get_automation_tool_definitions() -> list[dict]:
    """Return OpenAI-compatible function definitions for automation tools."""
    return [
        {
            "type": "function",
            "function": {
                "name": "automation__list",
                "description": "List all automations with their status and configuration summary.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "search": {
                            "type": "string",
                            "description": "Optional search query to filter automations by name.",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "automation__get",
                "description": "Get the full details of an automation by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The automation ID.",
                        },
                    },
                    "required": ["id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "automation__create",
                "description": (
                    "Create a new automation. Provide a name and optionally "
                    "a description, config (trigger, triage, execution, post_actions, settings), "
                    "and tags."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name of the automation.",
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional description.",
                        },
                        "config": {
                            "type": "object",
                            "description": (
                                "Automation config with keys: trigger, triage, execution, "
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
                "name": "automation__update",
                "description": "Update an existing automation. Only provided fields are changed.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The automation ID to update.",
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
                "name": "automation__toggle",
                "description": "Enable or disable an automation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The automation ID.",
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
                "name": "automation__delete",
                "description": "Delete an automation by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The automation ID to delete.",
                        },
                    },
                    "required": ["id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "automation__runs",
                "description": "Get the run history of an automation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The automation ID.",
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
                "name": "automation__trigger",
                "description": "Manually trigger an automation to run now.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The automation ID to trigger.",
                        },
                    },
                    "required": ["id"],
                },
            },
        },
    ]
