"""add_github_tokens

Revision ID: m7g8h9i0j1k2
Revises: l6f7g8h9i0j1
Create Date: 2026-03-21

Add github_tokens table for storing GitHub PATs with scopes.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "m7g8h9i0j1k2"
down_revision: str | None = "l6f7g8h9i0j1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "github_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("scopes", sa.ARRAY(sa.String()), server_default="{}"),
        sa.Column("is_default", sa.Boolean(), server_default="false"),
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
    op.create_index("ix_github_tokens_is_default", "github_tokens", ["is_default"])


def downgrade() -> None:
    op.drop_index("ix_github_tokens_is_default")
    op.drop_table("github_tokens")
