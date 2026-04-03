"""add_project_repositories

Revision ID: s3m4n5o6p7q8
Revises: r2l3m4n5o6p7
Create Date: 2026-04-03

Add project_repositories table for linking code repos to projects (FastCode MCP scoping).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "s3m4n5o6p7q8"
down_revision: str | None = "r2l3m4n5o6p7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project_repositories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("repo_identifier", sa.String(300), nullable=False),
        sa.Column("repo_url", sa.String(500), nullable=True),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_project_repos_project", "project_repositories", ["project_id"])
    op.create_index(
        "uq_project_repo",
        "project_repositories",
        ["project_id", "repo_identifier"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_project_repo", table_name="project_repositories")
    op.drop_index("ix_project_repos_project", table_name="project_repositories")
    op.drop_table("project_repositories")
