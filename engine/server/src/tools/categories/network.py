"""Network tools — HTTP requests to external APIs via Gateway."""

from __future__ import annotations

from typing import Any


def get_network_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for the network category."""
    return [
        {
            "type": "function",
            "function": {
                "name": "net_request",
                "description": "Make an HTTP request to an external API.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "URL to request",
                        },
                        "method": {
                            "type": "string",
                            "description": "HTTP method (GET, POST, etc.)",
                            "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                        },
                        "body": {
                            "type": "string",
                            "description": "Request body (for POST/PUT/PATCH)",
                        },
                        "headers": {
                            "type": "object",
                            "description": "Request headers",
                        },
                    },
                    "required": ["url"],
                },
            },
        }
    ]
