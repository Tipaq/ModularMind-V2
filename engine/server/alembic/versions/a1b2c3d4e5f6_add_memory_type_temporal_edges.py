"""add_memory_type_temporal_edges

Revision ID: a1b2c3d4e5f6
Revises: fc4125d7a33c
Create Date: 2026-03-01

Adds:
- MemoryType enum + memory_type column on memory_entries
- expired_at, last_scored_at columns on memory_entries
- memory_consolidation_logs table
- memory_edges table
- Backfill existing entries with memory_type classification
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "fc4125d7a33c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create MemoryType enum (uppercase names to match SQLAlchemy convention)
    memorytype_enum = sa.Enum("EPISODIC", "SEMANTIC", "PROCEDURAL", name="memorytype")
    memorytype_enum.create(op.get_bind(), checkfirst=True)

    # Create EdgeType enum (uppercase names to match SQLAlchemy convention)
    edgetype_enum = sa.Enum(
        "ENTITY_OVERLAP", "SAME_CATEGORY", "SEMANTIC_SIMILARITY", name="edgetype"
    )
    edgetype_enum.create(op.get_bind(), checkfirst=True)

    # Add new columns to memory_entries
    op.add_column(
        "memory_entries",
        sa.Column(
            "memory_type",
            memorytype_enum,
            nullable=False,
            server_default="EPISODIC",
        ),
    )
    op.add_column(
        "memory_entries",
        sa.Column("expired_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "memory_entries",
        sa.Column("last_scored_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_memory_entries_memory_type", "memory_entries", ["memory_type"]
    )

    # Backfill memory_type for existing entries
    # Note: memoryscope PG enum stores uppercase names (AGENT, USER_PROFILE, etc.)
    # Rule 1: user_profile scope with specific categories -> semantic
    op.execute(
        """
        UPDATE memory_entries
        SET memory_type = 'SEMANTIC'
        WHERE scope = 'USER_PROFILE'
          AND metadata->>'category' IN ('preference', 'personal_info', 'context')
        """
    )
    # Rule 2: agent/cross_conversation scope -> semantic
    op.execute(
        """
        UPDATE memory_entries
        SET memory_type = 'SEMANTIC'
        WHERE scope IN ('AGENT', 'CROSS_CONVERSATION')
        """
    )
    # Rule 3: everything else stays episodic (default)

    # Create memory_consolidation_logs table
    op.create_table(
        "memory_consolidation_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scope", sa.String(length=30), nullable=False),
        sa.Column("scope_id", sa.String(length=100), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column(
            "source_entry_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("result_entry_id", sa.String(length=36), nullable=True),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_consolidation_logs_created_at",
        "memory_consolidation_logs",
        ["created_at"],
    )

    # Create memory_edges table
    op.create_table(
        "memory_edges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column(
            "edge_type",
            postgresql.ENUM(
                "ENTITY_OVERLAP", "SAME_CATEGORY", "SEMANTIC_SIMILARITY",
                name="edgetype", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("weight", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column(
            "shared_entities",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["memory_entries.id"]),
        sa.ForeignKeyConstraint(["target_id"], ["memory_entries.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_edges_source_id", "memory_edges", ["source_id"])
    op.create_index("ix_memory_edges_target_id", "memory_edges", ["target_id"])
    op.create_index(
        "uq_memory_edges_src_tgt",
        "memory_edges",
        ["source_id", "target_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("memory_edges")
    op.drop_table("memory_consolidation_logs")

    op.drop_index("ix_memory_entries_memory_type", table_name="memory_entries")
    op.drop_column("memory_entries", "last_scored_at")
    op.drop_column("memory_entries", "expired_at")
    op.drop_column("memory_entries", "memory_type")

    sa.Enum(name="edgetype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="memorytype").drop(op.get_bind(), checkfirst=True)
