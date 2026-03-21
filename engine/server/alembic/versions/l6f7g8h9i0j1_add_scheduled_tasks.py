"""add_scheduled_tasks

Revision ID: l6f7g8h9i0j1
Revises: k5e6f7g8h9i0
Create Date: 2026-03-21

Create scheduled_tasks table, rename automation_runs to scheduled_task_runs,
rename automation_id column to scheduled_task_id.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from alembic import op

revision: str = "l6f7g8h9i0j1"
down_revision: str | None = "m7g8h9i0j1k2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "scheduled_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("config", JSONB(), nullable=False, server_default="{}"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("tags", ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False, server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now(),
        ),
    )

    op.rename_table("automation_runs", "scheduled_task_runs")

    op.alter_column(
        "scheduled_task_runs",
        "automation_id",
        new_column_name="scheduled_task_id",
    )

    # Drop old enum type and create new one
    op.execute(
        "ALTER TABLE scheduled_task_runs "
        "ALTER COLUMN status DROP DEFAULT"
    )
    op.execute(
        "ALTER TABLE scheduled_task_runs "
        "ALTER COLUMN status TYPE VARCHAR(20)"
    )
    op.execute("DROP TYPE IF EXISTS automationrunstatus")
    op.execute(
        "CREATE TYPE scheduledtaskrunstatus AS ENUM "
        "('pending', 'running', 'completed', 'failed', 'skipped')"
    )
    op.execute(
        "ALTER TABLE scheduled_task_runs "
        "ALTER COLUMN status TYPE scheduledtaskrunstatus "
        "USING status::scheduledtaskrunstatus"
    )

    # Add nullable FK to scheduled_tasks (existing rows may not have a match)
    op.alter_column(
        "scheduled_task_runs",
        "scheduled_task_id",
        nullable=True,
    )
    op.create_foreign_key(
        "fk_scheduled_task_runs_task_id",
        "scheduled_task_runs",
        "scheduled_tasks",
        ["scheduled_task_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_scheduled_task_runs_task_id", "scheduled_task_runs", type_="foreignkey",
    )

    op.alter_column(
        "scheduled_task_runs",
        "scheduled_task_id",
        new_column_name="automation_id",
        nullable=False,
    )

    op.execute(
        "ALTER TABLE scheduled_task_runs "
        "ALTER COLUMN status TYPE VARCHAR(20)"
    )
    op.execute("DROP TYPE IF EXISTS scheduledtaskrunstatus")
    op.execute(
        "CREATE TYPE automationrunstatus AS ENUM "
        "('pending', 'running', 'completed', 'failed', 'skipped')"
    )
    op.execute(
        "ALTER TABLE scheduled_task_runs "
        "ALTER COLUMN status TYPE automationrunstatus "
        "USING status::automationrunstatus"
    )

    op.rename_table("scheduled_task_runs", "automation_runs")
    op.drop_table("scheduled_tasks")
