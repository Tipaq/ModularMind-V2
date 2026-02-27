"""Shared RAG collection schemas."""

from pydantic import BaseModel


class CollectionConfig(BaseModel):
    """Collection configuration synced from Platform."""

    id: str
    name: str
    description: str | None = None
    scope: str = "PROJECT"
    version: int = 1
