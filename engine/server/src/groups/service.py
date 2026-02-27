"""Group service — CRUD operations for user groups."""

import logging
import re

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.models import User
from src.groups.models import UserGroup, UserGroupMember

logger = logging.getLogger(__name__)


def slugify(name: str) -> str:
    """Convert a group name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return slug.strip("-")


class GroupService:
    """Service for user group CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_group(
        self, name: str, slug: str | None = None, description: str | None = None
    ) -> UserGroup:
        """Create a new user group."""
        if not slug:
            slug = slugify(name)

        # Check uniqueness
        existing = await self.db.execute(
            select(UserGroup).where(
                (UserGroup.name == name) | (UserGroup.slug == slug)
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"Group with name '{name}' or slug '{slug}' already exists",
            )

        group = UserGroup(name=name, slug=slug, description=description)
        self.db.add(group)
        await self.db.commit()
        await self.db.refresh(group)
        return group

    async def list_groups(self) -> list[UserGroup]:
        """List all groups."""
        result = await self.db.execute(
            select(UserGroup).order_by(UserGroup.name)
        )
        return list(result.scalars().all())

    async def get_group(self, group_id: str) -> UserGroup:
        """Get a group by ID with members loaded."""
        result = await self.db.execute(
            select(UserGroup)
            .where(UserGroup.id == group_id)
            .options(selectinload(UserGroup.members))
        )
        group = result.scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        return group

    async def update_group(
        self, group_id: str, name: str | None = None,
        description: str | None = None, is_active: bool | None = None
    ) -> UserGroup:
        """Update a group."""
        group = await self.get_group(group_id)
        if name is not None:
            group.name = name
        if description is not None:
            group.description = description
        if is_active is not None:
            group.is_active = is_active
        await self.db.commit()
        await self.db.refresh(group)
        return group

    async def delete_group(self, group_id: str) -> None:
        """Delete a group (cascades to members)."""
        group = await self.get_group(group_id)
        await self.db.delete(group)
        await self.db.commit()

    async def add_member(
        self, group_id: str, user_id: str, role: str = "member"
    ) -> UserGroupMember:
        """Add a user to a group."""
        # Verify group exists
        await self.get_group(group_id)

        # Verify user exists
        user = await self.db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Check if already a member
        existing = await self.db.get(UserGroupMember, (user_id, group_id))
        if existing:
            raise HTTPException(status_code=409, detail="User already in group")

        member = UserGroupMember(
            user_id=user_id, group_id=group_id, role=role
        )
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def remove_member(self, group_id: str, user_id: str) -> None:
        """Remove a user from a group."""
        member = await self.db.get(UserGroupMember, (user_id, group_id))
        if not member:
            raise HTTPException(
                status_code=404, detail="User is not a member of this group"
            )
        await self.db.delete(member)
        await self.db.commit()

    async def get_user_groups(self, user_id: str) -> list[UserGroup]:
        """Get all groups a user belongs to."""
        result = await self.db.execute(
            select(UserGroup)
            .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
            .where(UserGroupMember.user_id == user_id)
            .order_by(UserGroup.name)
        )
        return list(result.scalars().all())

    async def get_user_group_slugs(self, user_id: str) -> list[str]:
        """Get group slugs for a user (used for JWT claims)."""
        result = await self.db.execute(
            select(UserGroup.slug)
            .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
            .where(UserGroupMember.user_id == user_id)
        )
        return list(result.scalars().all())

    async def get_group_members(self, group_id: str) -> list[dict]:
        """Get all members of a group with user details."""
        result = await self.db.execute(
            select(UserGroupMember, User)
            .join(User, User.id == UserGroupMember.user_id)
            .where(UserGroupMember.group_id == group_id)
            .order_by(User.email)
        )
        members = []
        for member, user in result.all():
            members.append({
                "user_id": member.user_id,
                "email": user.email,
                "role": member.role,
                "joined_at": member.joined_at,
            })
        return members
