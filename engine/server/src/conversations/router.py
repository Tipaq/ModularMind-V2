"""
Conversation router.

Aggregates all conversation sub-routers into a single router.
"""

from fastapi import APIRouter

from .admin_router import admin_router
from .attachment_router import router as attachment_router
from .compaction_router import router as compaction_router
from .crud_router import router as crud_router
from .message_router import router as message_router
from .search_router import router as search_router

router = APIRouter(prefix="/conversations", tags=["Conversations"])

router.include_router(search_router)
router.include_router(attachment_router)
router.include_router(crud_router)
router.include_router(message_router)
router.include_router(compaction_router)

__all__ = ["admin_router", "router"]
