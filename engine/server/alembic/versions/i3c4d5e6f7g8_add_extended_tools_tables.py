"""add_extended_tools_tables

Revision ID: i3c4d5e6f7g8
Revises: h2b3c4d5e6f7
Create Date: 2026-03-19

Add custom_tools and stored_files tables for the extended tool system.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "i3c4d5e6f7g8"
down_revision: str | None = "h2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "custom_tools",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("agent_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "parameters",
            sa.dialects.postgresql.JSONB(),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("executor_type", sa.String(20), nullable=False),
        sa.Column(
            "executor_config",
            sa.dialects.postgresql.JSONB(),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_custom_tools_agent_id", "custom_tools", ["agent_id"])
    op.create_index(
        "uq_custom_tools_agent_name",
        "custom_tools",
        ["agent_id", "name"],
        unique=True,
    )

    op.create_table(
        "stored_files",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("agent_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "content_type",
            sa.String(128),
            nullable=False,
            server_default="application/octet-stream",
        ),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("s3_bucket", sa.String(128), nullable=False),
        sa.Column("s3_key", sa.String(512), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_stored_files_agent_id", "stored_files", ["agent_id"])
    op.create_index("ix_stored_files_user_id", "stored_files", ["user_id"])


def downgrade() -> None:
    op.drop_table("stored_files")
    op.drop_table("custom_tools")
