"""Project permission dependencies."""

from typing import Annotated

from fastapi import Depends, HTTPException, Path, status

from src.auth.dependencies import CurrentUser
from src.auth.models import UserRole
from src.infra.database import DbSession
from src.projects.models import ProjectMember, ProjectMemberRole
from src.projects.service import ProjectService


async def get_project_membership(
    project_id: Annotated[str, Path()],
    user: CurrentUser,
    db: DbSession,
) -> ProjectMember:
    if user.role.level >= UserRole.ADMIN.level:
        return ProjectMember(
            project_id=project_id,
            user_id=user.id,
            role=ProjectMemberRole.OWNER,
        )

    service = ProjectService(db)
    member = await service.get_member(project_id, user.id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a project member",
        )
    return member


ProjectMembership = Annotated[ProjectMember, Depends(get_project_membership)]


def require_project_role(min_role: ProjectMemberRole):
    async def checker(membership: ProjectMembership) -> None:
        actual = ProjectMemberRole(membership.role)
        if actual.level < min_role.level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires project role {min_role.value} or higher",
            )

    return checker


RequireProjectEditor = Depends(require_project_role(ProjectMemberRole.EDITOR))
RequireProjectOwner = Depends(require_project_role(ProjectMemberRole.OWNER))
