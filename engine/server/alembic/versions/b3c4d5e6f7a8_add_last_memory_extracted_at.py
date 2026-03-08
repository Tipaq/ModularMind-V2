"""add_last_memory_extracted_at

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-03-02

Adds last_memory_extracted_at column to conversations table for tracking
the hybrid memory extraction trigger (idle + marathon).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("last_memory_extracted_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_conversations_extraction_scan",
        "conversations",
        ["updated_at", "last_memory_extracted_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_extraction_scan", table_name="conversations")
    op.drop_column("conversations", "last_memory_extracted_at")
