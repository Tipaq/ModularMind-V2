"""add_automation_runs

Revision ID: h2b3c4d5e6f7
Revises: g1a2b3c4d5e6
Create Date: 2026-03-08

Automation run history table for tracking automation execution results.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h2b3c4d5e6f7"
down_revision: Union[str, None] = "g1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "automation_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("automation_id", sa.String(36), nullable=False, index=True),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "completed", "failed", "skipped",
                    name="automationrunstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("source_type", sa.String(50), nullable=False, server_default=""),
        sa.Column("source_ref", sa.String(255), nullable=False, server_default=""),
        sa.Column("execution_id", sa.String(36), nullable=True),
        sa.Column("result_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("automation_runs")
    op.execute("DROP TYPE IF EXISTS automationrunstatus")
