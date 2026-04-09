"""Reusable pagination dependency for FastAPI routers."""

from dataclasses import dataclass

from fastapi import Query


@dataclass
class PaginationParams:
    """Parsed pagination parameters with computed offset."""

    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def get_pagination(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginationParams:
    """FastAPI dependency for standard pagination parameters."""
    return PaginationParams(page=page, page_size=page_size)
