"""Tool API response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ToolDefinitionResponse(BaseModel):
    name: str
    description: str = ""
    category: str
    source: str
    server_name: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)


class ToolCategoryResponse(BaseModel):
    id: str
    label: str
    description: str
    tool_count: int
    enabled_by_default: bool


class ToolsOverviewResponse(BaseModel):
    categories: list[ToolCategoryResponse]
    tools: list[ToolDefinitionResponse]
    total_count: int
