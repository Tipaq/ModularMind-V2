"""Pydantic models for structural indexing of external systems."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StructuralUnit(BaseModel):
    """One structural element discovered in an external system."""

    id: str = Field(description="UUID")
    system_id: str = Field(description="FK to IndexedSystem")
    kind: str = Field(description="entity, endpoint, table, field, class, function")
    name: str = Field(description="Short name, e.g. res.partner")
    qualified_name: str = Field(description="Fully qualified, e.g. odoo.res.partner")
    summary: str = Field(description="Skimmable one-liner")
    signature: str = Field(description="Type signature or schema without data")
    body_hash: str | None = Field(
        default=None, description="SHA256 of the full body for incremental reindex"
    )
    depth: int = Field(default=0, description="0=top-level, 1=child")
    parent_id: str | None = Field(default=None, description="Parent unit ID")
    metadata: dict = Field(default_factory=dict)


class Relationship(BaseModel):
    """Directed edge between two StructuralUnits."""

    source_id: str
    target_id: str
    kind: str = Field(description="has_field, foreign_key, calls, inherits, etc.")
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: dict = Field(default_factory=dict)


class SystemIndex(BaseModel):
    """Complete index result produced by a connector."""

    system_id: str
    units: list[StructuralUnit]
    relationships: list[Relationship]
