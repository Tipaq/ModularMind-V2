"""
Shared Pydantic base schemas.

Reusable response models to avoid duplication across modules.
"""

import math
from typing import Generic, TypeVar

from pydantic import BaseModel, computed_field

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

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_pages(self) -> int:
        if not self.page_size:
            return 1
        return max(1, math.ceil(self.total / self.page_size))


class ActionResponse(BaseModel):
    """Standard response for action endpoints (stop, pause, resume, etc.)."""

    status: str
