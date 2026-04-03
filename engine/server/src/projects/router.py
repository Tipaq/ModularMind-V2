"""Project management API router."""

from fastapi import APIRouter, Response, status

from src.auth import CurrentUser
from src.infra.database import DbSession
from src.projects.dependencies import (
    ProjectMembership,
    RequireProjectEditor,
    RequireProjectOwner,
)
from src.projects.models import Project
from src.projects.schemas import (
    MemberResponse,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectMemberAdd,
    ProjectMemberUpdate,
    ProjectRepoAdd,
    ProjectRepoResponse,
    ProjectResponse,
    ProjectUpdate,
    ResourceCounts,
)
from src.projects.service import ProjectService

router = APIRouter(prefix="/projects", tags=["Projects"])


def _project_response(project: Project, member_count: int = 0) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        icon=project.icon,
        color=project.color,
        owner_user_id=project.owner_user_id,
        is_archived=project.is_archived,
        created_at=project.created_at,
        updated_at=project.updated_at,
        member_count=member_count,
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: CurrentUser,
    db: DbSession,
    include_archived: bool = False,
) -> list[ProjectResponse]:
    service = ProjectService(db)
    projects = await service.list_user_projects(user.id, include_archived)
    return [_project_response(p) for p in projects]


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    data: ProjectCreate,
    user: CurrentUser,
    db: DbSession,
) -> ProjectResponse:
    service = ProjectService(db)
    project = await service.create_project(
        name=data.name,
        owner_user_id=user.id,
        slug=data.slug,
        description=data.description,
        icon=data.icon,
        color=data.color,
    )
    return _project_response(project, member_count=1)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: str,
    membership: ProjectMembership,
    db: DbSession,
) -> ProjectDetailResponse:
    service = ProjectService(db)
    project = await service.get_project(project_id)
    members_data = await service.get_members(project_id)
    members = [
        MemberResponse(
            user_id=m["user_id"],
            email=m["email"],
            role=m["role"],
            joined_at=m["joined_at"],
        )
        for m in members_data
    ]
    return ProjectDetailResponse(
        id=project.id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        icon=project.icon,
        color=project.color,
        owner_user_id=project.owner_user_id,
        is_archived=project.is_archived,
        created_at=project.created_at,
        updated_at=project.updated_at,
        member_count=len(members),
        members=members,
    )


@router.put(
    "/{project_id}",
    response_model=ProjectResponse,
    dependencies=[RequireProjectEditor],
)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    membership: ProjectMembership,
    db: DbSession,
) -> ProjectResponse:
    service = ProjectService(db)
    project = await service.update_project(
        project_id,
        name=data.name,
        description=data.description,
        icon=data.icon,
        color=data.color,
        is_archived=data.is_archived,
    )
    return _project_response(project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireProjectOwner],
)
async def delete_project(
    project_id: str,
    membership: ProjectMembership,
    db: DbSession,
) -> Response:
    service = ProjectService(db)
    await service.delete_project(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Members ──────────────────────────────────────────────────────────────


@router.post(
    "/{project_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireProjectOwner],
)
async def add_member(
    project_id: str,
    data: ProjectMemberAdd,
    membership: ProjectMembership,
    db: DbSession,
) -> MemberResponse:
    service = ProjectService(db)
    member = await service.add_member(project_id, data.user_id, data.role)
    from src.auth.models import User

    user_obj = await db.get(User, data.user_id)
    return MemberResponse(
        user_id=member.user_id,
        email=user_obj.email if user_obj else "",
        role=member.role,
        joined_at=member.joined_at,
    )


@router.put(
    "/{project_id}/members/{user_id}",
    response_model=MemberResponse,
    dependencies=[RequireProjectOwner],
)
async def update_member(
    project_id: str,
    user_id: str,
    data: ProjectMemberUpdate,
    membership: ProjectMembership,
    db: DbSession,
) -> MemberResponse:
    service = ProjectService(db)
    member = await service.update_member_role(project_id, user_id, data.role)
    from src.auth.models import User

    user_obj = await db.get(User, user_id)
    return MemberResponse(
        user_id=member.user_id,
        email=user_obj.email if user_obj else "",
        role=member.role,
        joined_at=member.joined_at,
    )


@router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireProjectOwner],
)
async def remove_member(
    project_id: str,
    user_id: str,
    membership: ProjectMembership,
    db: DbSession,
) -> Response:
    service = ProjectService(db)
    await service.remove_member(project_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Repositories ─────────────────────────────────────────────────────────


@router.get("/{project_id}/repositories", response_model=list[ProjectRepoResponse])
async def list_repositories(
    project_id: str,
    membership: ProjectMembership,
    db: DbSession,
) -> list[ProjectRepoResponse]:
    service = ProjectService(db)
    repos = await service.list_project_repos(project_id)
    return [ProjectRepoResponse.model_validate(r) for r in repos]


@router.post(
    "/{project_id}/repositories",
    response_model=ProjectRepoResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireProjectEditor],
)
async def add_repository(
    project_id: str,
    data: ProjectRepoAdd,
    membership: ProjectMembership,
    db: DbSession,
) -> ProjectRepoResponse:
    service = ProjectService(db)
    repo = await service.add_project_repo(
        project_id,
        repo_identifier=data.repo_identifier,
        repo_url=data.repo_url,
        display_name=data.display_name,
    )
    return ProjectRepoResponse.model_validate(repo)


@router.delete(
    "/{project_id}/repositories/{repo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireProjectEditor],
)
async def remove_repository(
    project_id: str,
    repo_id: str,
    membership: ProjectMembership,
    db: DbSession,
) -> Response:
    service = ProjectService(db)
    await service.remove_project_repo(project_id, repo_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Resources ────────────────────────────────────────────────────────────


@router.get("/{project_id}/resources", response_model=ResourceCounts)
async def get_resource_counts(
    project_id: str,
    membership: ProjectMembership,
    db: DbSession,
) -> ResourceCounts:
    service = ProjectService(db)
    counts = await service.get_resource_counts(project_id)
    return ResourceCounts(**counts)


@router.post(
    "/{project_id}/{resource_type}/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireProjectEditor],
)
async def assign_resource(
    project_id: str,
    resource_type: str,
    resource_id: str,
    membership: ProjectMembership,
    db: DbSession,
) -> Response:
    service = ProjectService(db)
    await service.assign_resource(project_id, resource_type, resource_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/{project_id}/{resource_type}/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireProjectEditor],
)
async def unassign_resource(
    project_id: str,
    resource_type: str,
    resource_id: str,
    membership: ProjectMembership,
    db: DbSession,
) -> Response:
    service = ProjectService(db)
    await service.unassign_resource(project_id, resource_type, resource_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
