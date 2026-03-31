"""System Indexer tools — search and skim indexed external systems."""

from __future__ import annotations

from typing import Any


def get_system_indexer_tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "system_index_search",
                "description": (
                    "Search the structural index of an external system "
                    "(ERP, database, API). Returns matching entities, tables, "
                    "endpoints, or fields with optional graph expansion."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "system_name": {
                            "type": "string",
                            "description": "Name of the indexed system to search.",
                        },
                        "query": {
                            "type": "string",
                            "description": "Natural language search query.",
                        },
                        "kind_filter": {
                            "type": "string",
                            "description": (
                                "Filter by structural kind: entity, table, "
                                "endpoint, field, etc."
                            ),
                        },
                        "max_hops": {
                            "type": "integer",
                            "description": (
                                "Graph expansion hops (0=search only, "
                                "1-2=include related entities)."
                            ),
                        },
                    },
                    "required": ["system_name", "query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "system_index_skim",
                "description": (
                    "Get a high-level structural overview of an indexed system. "
                    "Returns a tree of top-level entities (tables, endpoints, models)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "system_name": {
                            "type": "string",
                            "description": "Name of the indexed system.",
                        },
                        "max_tokens": {
                            "type": "integer",
                            "description": "Max tokens for the overview (default 2000).",
                        },
                    },
                    "required": ["system_name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "system_index_list",
                "description": "List all indexed external systems with their status and stats.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                },
            },
        },
    ]
