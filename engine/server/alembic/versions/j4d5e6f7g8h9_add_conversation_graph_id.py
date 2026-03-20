"""add_conversation_graph_id

Revision ID: j4d5e6f7g8h9
Revises: i3c4d5e6f7g8
Create Date: 2026-03-19

Add graph_id column to conversations table for direct graph execution.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "j4d5e6f7g8h9"
down_revision: str | None = "i3c4d5e6f7g8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("graph_id", sa.String(36), nullable=True),
    )
    op.create_index("ix_conversations_graph_id", "conversations", ["graph_id"])


def downgrade() -> None:
    op.drop_index("ix_conversations_graph_id", table_name="conversations")
    op.drop_column("conversations", "graph_id")
