"""add_system_indexer_tables

Revision ID: r2l3m4n5o6p7
Revises: q1k2l3m4n5o6
Create Date: 2026-03-31

Add indexed_systems and system_relationships tables for the System Indexer framework.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "r2l3m4n5o6p7"
down_revision: str | None = "q1k2l3m4n5o6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "indexed_systems",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("system_type", sa.String(50), nullable=False),
        sa.Column("base_url", sa.Text, nullable=True),
        sa.Column("mcp_server_id", sa.String(36), nullable=True),
        sa.Column("unit_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("relationship_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("last_indexed_at", sa.DateTime, nullable=True),
        sa.Column("credential_ref", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "system_relationships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("system_id", sa.String(36), nullable=False),
        sa.Column("source_unit_id", sa.String(36), nullable=False),
        sa.Column("target_unit_id", sa.String(36), nullable=False),
        sa.Column("kind", sa.String(50), nullable=False),
        sa.Column("weight", sa.Float, server_default="1.0", nullable=False),
        sa.Column(
            "metadata",
            sa.JSON,
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_sysrel_system_source",
        "system_relationships",
        ["system_id", "source_unit_id"],
    )
    op.create_index(
        "ix_sysrel_system_target",
        "system_relationships",
        ["system_id", "target_unit_id"],
    )
    op.create_index(
        "ix_sysrel_system_id",
        "system_relationships",
        ["system_id"],
    )


def downgrade() -> None:
    op.drop_table("system_relationships")
    op.drop_table("indexed_systems")
