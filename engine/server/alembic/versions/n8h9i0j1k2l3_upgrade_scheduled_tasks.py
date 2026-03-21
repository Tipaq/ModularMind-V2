"""upgrade_scheduled_tasks

Revision ID: n8h9i0j1k2l3
Revises: m7g8h9i0j1k2
Create Date: 2026-03-21

Add proper scheduling columns to scheduled_tasks: schedule_type, interval,
one-shot, target, and timing fields.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "n8h9i0j1k2l3"
down_revision: str | None = "m7g8h9i0j1k2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scheduled_tasks",
        sa.Column("schedule_type", sa.String(20), server_default="manual", nullable=False),
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("interval_value", sa.Integer(), nullable=True),
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("interval_unit", sa.String(20), nullable=True),
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("scheduled_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("next_run_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("target_type", sa.String(20), server_default="agent", nullable=False),
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("target_id", sa.String(36), nullable=True),
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("input_text", sa.Text(), server_default="", nullable=False),
    )

    # Migrate existing data from JSONB config to new columns
    op.execute("""
        UPDATE scheduled_tasks SET
            schedule_type = COALESCE(config->'trigger'->>'type', 'manual'),
            interval_value = CASE
                WHEN (config->'trigger'->>'interval_seconds')::int IS NOT NULL
                THEN GREATEST(1, (config->'trigger'->>'interval_seconds')::int / 3600)
            END,
            interval_unit = CASE
                WHEN config->'trigger'->>'interval_seconds' IS NOT NULL THEN 'hours'
            END,
            target_type = CASE
                WHEN config->'execution'->>'graph_id' IS NOT NULL THEN 'graph'
                ELSE 'agent'
            END,
            target_id = COALESCE(
                config->'execution'->>'graph_id',
                config->'execution'->>'agent_id'
            )
        WHERE config IS NOT NULL AND config != '{}'::jsonb
    """)


def downgrade() -> None:
    op.drop_column("scheduled_tasks", "input_text")
    op.drop_column("scheduled_tasks", "target_id")
    op.drop_column("scheduled_tasks", "target_type")
    op.drop_column("scheduled_tasks", "last_run_at")
    op.drop_column("scheduled_tasks", "next_run_at")
    op.drop_column("scheduled_tasks", "scheduled_at")
    op.drop_column("scheduled_tasks", "interval_unit")
    op.drop_column("scheduled_tasks", "interval_value")
    op.drop_column("scheduled_tasks", "schedule_type")
