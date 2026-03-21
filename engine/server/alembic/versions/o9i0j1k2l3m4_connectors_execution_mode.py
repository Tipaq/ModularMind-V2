"""connectors_execution_mode

Revision ID: o9i0j1k2l3m4
Revises: n8h9i0j1k2l3
Create Date: 2026-03-21

Add graph_id, supervisor_mode to connectors table and make agent_id nullable.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "o9i0j1k2l3m4"
down_revision: str | None = "n8h9i0j1k2l3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("connectors", sa.Column("graph_id", sa.String(36), nullable=True))
    op.add_column(
        "connectors", sa.Column("supervisor_mode", sa.Boolean(), server_default="false")
    )
    op.alter_column("connectors", "agent_id", existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    op.alter_column("connectors", "agent_id", existing_type=sa.String(36), nullable=False)
    op.drop_column("connectors", "supervisor_mode")
    op.drop_column("connectors", "graph_id")
