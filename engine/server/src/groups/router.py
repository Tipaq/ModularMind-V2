"""Group management API router."""

from fastapi import APIRouter, Response, status

from src.auth import CurrentUser, RequireAdmin
from src.groups.models import UserGroup
from src.groups.schemas import (
    GroupCreate,
    GroupDetailResponse,
    GroupResponse,
    GroupUpdate,
    MemberAdd,
    MemberResponse,
)
from src.groups.service import GroupService
from src.infra.database import DbSession

router = APIRouter(prefix="/groups", tags=["Groups"])


def _group_response(group: UserGroup, member_count: int = 0) -> GroupResponse:
    """Convert a UserGroup model to a GroupResponse."""
    return GroupResponse(
        id=group.id,
        name=group.name,
        slug=group.slug,
        description=group.description,
        is_active=group.is_active,
        created_at=group.created_at,
        member_count=member_count,
    )


@router.get("", response_model=list[GroupResponse])
async def list_groups(
    user: CurrentUser,
    db: DbSession,
) -> list[GroupResponse]:
    """List all groups."""
    service = GroupService(db)
    groups = await service.list_groups()
    return [_group_response(g) for g in groups]


@router.post(
    "",
    response_model=GroupResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireAdmin],
)
async def create_group(
    data: GroupCreate,
    user: CurrentUser,
    db: DbSession,
) -> GroupResponse:
    """Create a new group (admin only)."""
    service = GroupService(db)
    group = await service.create_group(
        name=data.name, slug=data.slug, description=data.description
    )
    return _group_response(group)


# User's own groups — must be defined BEFORE /{group_id} to avoid path collision.
@router.get("/me/groups", response_model=list[GroupResponse])
async def get_my_groups(
    user: CurrentUser,
    db: DbSession,
) -> list[GroupResponse]:
    """Get groups for the current authenticated user."""
    service = GroupService(db)
    groups = await service.get_user_groups(user.id)
    return [_group_response(g) for g in groups]


@router.get("/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: str,
    user: CurrentUser,
    db: DbSession,
) -> GroupDetailResponse:
    """Get group details with members."""
    service = GroupService(db)
    group = await service.get_group(group_id)
    members_data = await service.get_group_members(group_id)
    members = [
        MemberResponse(
            user_id=m["user_id"],
            email=m["email"],
            role=m["role"],
            joined_at=m["joined_at"],
        )
        for m in members_data
    ]
    return GroupDetailResponse(
        id=group.id,
        name=group.name,
        slug=group.slug,
        description=group.description,
        is_active=group.is_active,
        created_at=group.created_at,
        member_count=len(members),
        members=members,
    )


@router.put("/{group_id}", response_model=GroupResponse, dependencies=[RequireAdmin])
async def update_group(
    group_id: str,
    data: GroupUpdate,
    user: CurrentUser,
    db: DbSession,
) -> GroupResponse:
    """Update a group (admin only)."""
    service = GroupService(db)
    group = await service.update_group(
        group_id, name=data.name, description=data.description, is_active=data.is_active
    )
    return _group_response(group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def delete_group(
    group_id: str,
    user: CurrentUser,
    db: DbSession,
) -> Response:
    """Delete a group (admin only, cascades to members)."""
    service = GroupService(db)
    await service.delete_group(group_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{group_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireAdmin],
)
async def add_member(
    group_id: str,
    data: MemberAdd,
    user: CurrentUser,
    db: DbSession,
) -> MemberResponse:
    """Add a member to a group (admin only)."""
    service = GroupService(db)
    member = await service.add_member(group_id, data.user_id, data.role)
    # Fetch user email for response
    from src.auth.models import User
    user_obj = await db.get(User, data.user_id)
    return MemberResponse(
        user_id=member.user_id,
        email=user_obj.email if user_obj else "",
        role=member.role,
        joined_at=member.joined_at,
    )


@router.delete(
    "/{group_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireAdmin],
)
async def remove_member(
    group_id: str,
    user_id: str,
    user: CurrentUser,
    db: DbSession,
) -> Response:
    """Remove a member from a group (admin only)."""
    service = GroupService(db)
    await service.remove_member(group_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
