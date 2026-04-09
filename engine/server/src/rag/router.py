"""RAG router — collection CRUD + sub-router mounting."""

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from src.auth import CurrentUser, CurrentUserGroups, UserRole
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .models import RAGCollection, RAGScope
from .repository import RAGRepository
from .schemas import (
    CollectionCreate,
    CollectionListResponse,
    CollectionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["RAG"])


# ─── Collection Endpoints ──────────────────────────────────────────────────────


@router.get("/collections", response_model=CollectionListResponse)
async def list_collections(
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
    project_id: str | None = None,
) -> CollectionListResponse:
    """List RAG collections accessible to the current user."""
    repo = RAGRepository(db)
    collections = await repo.list_collections_for_user(user.id, user_groups, project_id)
    return CollectionListResponse(
        items=[CollectionResponse.model_validate(c) for c in collections],
        total=len(collections),
    )


@router.post("/collections", response_model=CollectionResponse, status_code=201)
async def create_collection(
    data: CollectionCreate,
    user: CurrentUser,
    db: DbSession,
) -> CollectionResponse:
    """Create a new RAG collection."""
    if data.scope == RAGScope.GLOBAL and user.role.level < UserRole.ADMIN.level:
        raise HTTPException(
            status_code=403,
            detail="Only admin or owner can create GLOBAL collections",
        )

    if data.scope == RAGScope.GROUP and not data.allowed_groups:
        raise HTTPException(
            status_code=400,
            detail="allowed_groups is required for GROUP-scoped collections",
        )

    owner_user_id = data.owner_user_id
    if data.scope == RAGScope.AGENT and not owner_user_id:
        owner_user_id = user.id

    collection = RAGCollection(
        id=str(uuid4()),
        name=data.name,
        description=data.description,
        scope=data.scope,
        allowed_groups=data.allowed_groups,
        owner_user_id=owner_user_id,
    )
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    return CollectionResponse.model_validate(collection)


@router.get("/collections/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> CollectionResponse:
    """Get a specific collection (only if user has access)."""
    repo = RAGRepository(db)
    collection = await repo.get_collection(collection_id)
    if not collection:
        raise_not_found("Collection")
    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")
    return CollectionResponse.model_validate(collection)


@router.delete("/collections/{collection_id}", status_code=204)
async def delete_collection(
    collection_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> None:
    """Delete a collection and all its documents/chunks."""
    repo = RAGRepository(db)
    collection = await repo.get_collection(collection_id)
    if not collection:
        raise_not_found("Collection")
    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")

    await db.delete(collection)
    await db.commit()

    try:
        from .vector_store import QdrantRAGVectorStore

        vs = QdrantRAGVectorStore()
        await vs.delete_by_collection(collection_id)
    except (ConnectionError, OSError, RuntimeError) as exc:
        logger.error("Qdrant cleanup failed for collection %s: %s", collection_id, exc)
