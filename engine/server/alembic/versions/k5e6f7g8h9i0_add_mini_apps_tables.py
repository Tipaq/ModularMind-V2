"""add_mini_apps_tables

Revision ID: k5e6f7g8h9i0
Revises: j4d5e6f7g8h9
Create Date: 2026-03-21

Add mini_apps, mini_app_files, mini_app_storage, mini_app_snapshots tables.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from alembic import op

revision: str = "k5e6f7g8h9i0"
down_revision: str | None = "j4d5e6f7g8h9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mini_apps",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("icon", sa.String(200), nullable=True),
        sa.Column("entry_file", sa.String(200), server_default="index.html", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "scope",
            sa.Enum("GLOBAL", "GROUP", "PERSONAL", name="miniappscope"),
            server_default="PERSONAL",
            nullable=False,
        ),
        sa.Column("allowed_groups", ARRAY(sa.String()), server_default="{}", nullable=False),
        sa.Column("owner_user_id", sa.String(36), nullable=True),
        sa.Column("agent_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("agent_id", "slug", name="uq_mini_apps_agent_slug"),
    )
    op.create_index("ix_mini_apps_scope", "mini_apps", ["scope"])
    op.create_index("ix_mini_apps_owner", "mini_apps", ["owner_user_id"])

    op.create_table(
        "mini_app_files",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "app_id", sa.String(36),
            sa.ForeignKey("mini_apps.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), server_default="", nullable=False),
        sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("content_type", sa.String(100), server_default="text/plain", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("app_id", "path", name="uq_mini_app_files_app_path"),
    )

    op.create_table(
        "mini_app_storage",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "app_id", sa.String(36),
            sa.ForeignKey("mini_apps.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("key", sa.String(256), nullable=False),
        sa.Column("value", JSONB(), server_default="{}", nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("app_id", "key", name="uq_mini_app_storage_app_key"),
    )
    op.create_index("ix_mini_app_storage_app", "mini_app_storage", ["app_id"])

    op.create_table(
        "mini_app_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "app_id", sa.String(36),
            sa.ForeignKey("mini_apps.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("file_manifest", JSONB(), server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_mini_app_snapshots_app", "mini_app_snapshots", ["app_id"])


def downgrade() -> None:
    op.drop_table("mini_app_snapshots")
    op.drop_table("mini_app_storage")
    op.drop_table("mini_app_files")
    op.drop_table("mini_apps")
    op.execute("DROP TYPE IF EXISTS miniappscope")
