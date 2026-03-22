"""add_start_at_to_scheduled_tasks

Revision ID: p0j1k2l3m4n5
Revises: o9i0j1k2l3m4
Create Date: 2026-03-21

Add start_at column (HH:MM anchor time) to scheduled_tasks for interval alignment.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "p0j1k2l3m4n5"
down_revision: str | None = "o9i0j1k2l3m4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scheduled_tasks",
        sa.Column("start_at", sa.String(5), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scheduled_tasks", "start_at")
