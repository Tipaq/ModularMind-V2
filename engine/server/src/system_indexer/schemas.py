"""API request/response schemas for the System Indexer."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CreateSystemRequest(BaseModel):
    name: str = Field(max_length=200)
    system_type: str = Field(description="erp, api, database")
    base_url: str | None = None
    documentation_url: str | None = None


class SystemResponse(BaseModel):
    id: str
    name: str
    system_type: str
    base_url: str | None
    mcp_server_id: str | None
    unit_count: int
    relationship_count: int
    status: str
    last_indexed_at: datetime | None
    created_at: datetime


class SystemListResponse(BaseModel):
    items: list[SystemResponse]
    total: int


class StructureItem(BaseModel):
    unit_id: str
    content: str
    kind: str
    depth: int
    parent_id: str | None
    body_hash: str | None


class StructureResponse(BaseModel):
    items: list[StructureItem]
    total: int


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    kind_filter: str | None = None
    max_hops: int = Field(default=0, ge=0, le=3)
    limit: int = Field(default=10, ge=1, le=50)


class SearchResult(BaseModel):
    unit_id: str
    content: str
    score: float
    kind: str
    depth: int


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
