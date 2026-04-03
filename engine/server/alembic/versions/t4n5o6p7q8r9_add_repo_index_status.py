"""add_repo_index_status

Revision ID: t4n5o6p7q8r9
Revises: s3m4n5o6p7q8
Create Date: 2026-04-03

Add index_status, index_error, indexed_at columns to project_repositories.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "t4n5o6p7q8r9"
down_revision: str | None = "s3m4n5o6p7q8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "project_repositories",
        sa.Column("index_status", sa.String(20), nullable=False, server_default="pending"),
    )
    op.add_column(
        "project_repositories",
        sa.Column("index_error", sa.Text(), nullable=True),
    )
    op.add_column(
        "project_repositories",
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_repositories", "indexed_at")
    op.drop_column("project_repositories", "index_error")
    op.drop_column("project_repositories", "index_status")
