"""
Shared Pydantic base schemas.

Reusable response models to avoid duplication across modules.
"""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated list response.

    Usage::

        class AgentListResponse(PaginatedResponse[AgentResponse]):
            pass

    Or inline::

        PaginatedResponse[AgentResponse]
    """

    items: list[T]
    total: int
    page: int | None = None
    page_size: int | None = None
