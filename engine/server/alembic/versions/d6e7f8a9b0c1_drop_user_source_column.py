"""drop_user_source_column

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-03-03

Removes the 'source' column and 'usersource' enum type from the users table.
Platform users are now identified by platform_user_id IS NOT NULL.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("users", "source")
    # Drop the enum type created by SQLAlchemy
    sa.Enum(name="usersource").drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    usersource = sa.Enum("local", "platform", name="usersource")
    usersource.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "users",
        sa.Column("source", usersource, nullable=False, server_default="local"),
    )
