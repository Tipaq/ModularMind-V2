"""Project service — CRUD operations for user projects."""

import logging
import re

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.models import User
from src.conversations.models import Conversation
from src.infra.query_utils import raise_not_found
from src.mini_apps.models import MiniApp
from src.projects.models import Project, ProjectMember, ProjectRepository
from src.rag.models import RAGCollection
from src.scheduled_tasks.models import ScheduledTask

logger = logging.getLogger(__name__)


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return slug.strip("-")


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_project(
        self,
        name: str,
        owner_user_id: str,
        slug: str | None = None,
        description: str | None = None,
        icon: str | None = None,
        color: str | None = None,
    ) -> Project:
        if not slug:
            slug = _slugify(name)

        existing = await self.db.execute(select(Project).where(Project.slug == slug))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"Slug '{slug}' already taken")

        project = Project(
            name=name,
            slug=slug,
            description=description,
            icon=icon,
            color=color,
            owner_user_id=owner_user_id,
        )
        self.db.add(project)
        await self.db.flush()

        owner_member = ProjectMember(project_id=project.id, user_id=owner_user_id, role="owner")
        self.db.add(owner_member)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def list_user_projects(
        self, user_id: str, include_archived: bool = False
    ) -> list[Project]:
        query = (
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user_id)
            .order_by(Project.name)
        )
        if not include_archived:
            query = query.where(Project.is_archived.is_(False))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_project(self, project_id: str) -> Project:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id).options(selectinload(Project.members))
        )
        project = result.scalar_one_or_none()
        if not project:
            raise_not_found("Project")
        return project

    async def update_project(
        self,
        project_id: str,
        name: str | None = None,
        description: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        is_archived: bool | None = None,
    ) -> Project:
        project = await self.get_project(project_id)
        if name is not None:
            project.name = name
        if description is not None:
            project.description = description
        if icon is not None:
            project.icon = icon
        if color is not None:
            project.color = color
        if is_archived is not None:
            project.is_archived = is_archived
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def delete_project(self, project_id: str) -> None:
        project = await self.get_project(project_id)
        await self.db.delete(project)
        await self.db.commit()

    async def add_member(
        self, project_id: str, user_id: str, role: str = "editor"
    ) -> ProjectMember:
        await self.get_project(project_id)

        user = await self.db.get(User, user_id)
        if not user:
            raise_not_found("User")

        existing = await self.db.get(ProjectMember, (project_id, user_id))
        if existing:
            raise HTTPException(status_code=409, detail="User already in project")

        member = ProjectMember(project_id=project_id, user_id=user_id, role=role)
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def update_member_role(self, project_id: str, user_id: str, role: str) -> ProjectMember:
        member = await self.db.get(ProjectMember, (project_id, user_id))
        if not member:
            raise HTTPException(status_code=404, detail="User is not a project member")
        member.role = role
        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def remove_member(self, project_id: str, user_id: str) -> None:
        member = await self.db.get(ProjectMember, (project_id, user_id))
        if not member:
            raise HTTPException(status_code=404, detail="User is not a project member")

        if member.role == "owner":
            owners = await self.db.execute(
                select(func.count())
                .select_from(ProjectMember)
                .where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.role == "owner",
                )
            )
            if owners.scalar_one() <= 1:
                raise HTTPException(status_code=400, detail="Cannot remove the last project owner")

        await self.db.delete(member)
        await self.db.commit()

    async def get_member(self, project_id: str, user_id: str) -> ProjectMember | None:
        return await self.db.get(ProjectMember, (project_id, user_id))

    async def get_members(self, project_id: str) -> list[dict]:
        result = await self.db.execute(
            select(ProjectMember, User)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == project_id)
            .order_by(User.email)
        )
        members = []
        for member, user in result.all():
            members.append(
                {
                    "user_id": member.user_id,
                    "email": user.email,
                    "role": member.role,
                    "joined_at": member.joined_at,
                }
            )
        return members

    async def get_resource_counts(self, project_id: str) -> dict[str, int]:
        conversations = await self.db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.project_id == project_id)
        )
        collections = await self.db.execute(
            select(func.count())
            .select_from(RAGCollection)
            .where(RAGCollection.project_id == project_id)
        )
        mini_apps = await self.db.execute(
            select(func.count()).select_from(MiniApp).where(MiniApp.project_id == project_id)
        )
        tasks = await self.db.execute(
            select(func.count())
            .select_from(ScheduledTask)
            .where(ScheduledTask.project_id == project_id)
        )
        repositories = await self.db.execute(
            select(func.count())
            .select_from(ProjectRepository)
            .where(ProjectRepository.project_id == project_id)
        )
        return {
            "conversations": conversations.scalar_one(),
            "collections": collections.scalar_one(),
            "mini_apps": mini_apps.scalar_one(),
            "scheduled_tasks": tasks.scalar_one(),
            "repositories": repositories.scalar_one(),
        }

    # ── Repositories ───────────────────────────────────────────────────────

    async def list_project_repos(self, project_id: str) -> list[ProjectRepository]:
        result = await self.db.execute(
            select(ProjectRepository)
            .where(ProjectRepository.project_id == project_id)
            .order_by(ProjectRepository.repo_identifier)
        )
        return list(result.scalars().all())

    async def add_project_repo(
        self,
        project_id: str,
        repo_identifier: str,
        repo_url: str | None = None,
        display_name: str | None = None,
    ) -> ProjectRepository:
        await self.get_project(project_id)

        existing = await self.db.execute(
            select(ProjectRepository).where(
                ProjectRepository.project_id == project_id,
                ProjectRepository.repo_identifier == repo_identifier,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Repository already in project")

        repo = ProjectRepository(
            project_id=project_id,
            repo_identifier=repo_identifier,
            repo_url=repo_url,
            display_name=display_name,
        )
        self.db.add(repo)
        await self.db.commit()
        await self.db.refresh(repo)
        return repo

    async def remove_project_repo(self, project_id: str, repo_id: str) -> None:
        result = await self.db.execute(
            select(ProjectRepository).where(
                ProjectRepository.id == repo_id,
                ProjectRepository.project_id == project_id,
            )
        )
        repo = result.scalar_one_or_none()
        if not repo:
            raise_not_found("Repository")
        await self.db.delete(repo)
        await self.db.commit()

    async def get_project_repo_identifiers(self, project_id: str) -> list[str]:
        result = await self.db.execute(
            select(ProjectRepository.repo_identifier).where(
                ProjectRepository.project_id == project_id
            )
        )
        return [r[0] for r in result.all()]

    # ── Resource assignment ────────────────────────────────────────────────

    async def assign_resource(self, project_id: str, resource_type: str, resource_id: str) -> None:
        model_map = {
            "conversations": Conversation,
            "collections": RAGCollection,
            "mini-apps": MiniApp,
            "tasks": ScheduledTask,
        }
        model = model_map.get(resource_type)
        if not model:
            raise HTTPException(status_code=400, detail=f"Unknown resource type: {resource_type}")

        resource = await self.db.get(model, resource_id)
        if not resource:
            raise_not_found(resource_type)

        resource.project_id = project_id
        await self.db.commit()

    async def unassign_resource(
        self, project_id: str, resource_type: str, resource_id: str
    ) -> None:
        model_map = {
            "conversations": Conversation,
            "collections": RAGCollection,
            "mini-apps": MiniApp,
            "tasks": ScheduledTask,
        }
        model = model_map.get(resource_type)
        if not model:
            raise HTTPException(status_code=400, detail=f"Unknown resource type: {resource_type}")

        resource = await self.db.get(model, resource_id)
        if not resource:
            raise_not_found(resource_type)

        if resource.project_id != project_id:
            raise HTTPException(status_code=400, detail="Resource is not assigned to this project")

        resource.project_id = None
        await self.db.commit()
