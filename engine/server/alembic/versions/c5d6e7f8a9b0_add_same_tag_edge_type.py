"""add_same_tag_edge_type

Revision ID: c5d6e7f8a9b0
Revises: b3c4d5e6f7a8
Create Date: 2026-03-02

Adds SAME_TAG value to the edgetype PostgreSQL enum.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE to add enum values
    op.execute("ALTER TYPE edgetype ADD VALUE IF NOT EXISTS 'SAME_TAG'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values — no-op
    pass
