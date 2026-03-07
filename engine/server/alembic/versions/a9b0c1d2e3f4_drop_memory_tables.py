"""drop_memory_tables

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-03-06

Phase 9 of memory-to-RAG migration:
- Drop memory_edges, memory_consolidation_logs, memory_entries tables
- Drop conversations.last_memory_extracted_at column + index
- Drop memorytype and edgetype PostgreSQL enums
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Drop memory_edges (FK → memory_entries, must go first) ---
    op.drop_table("memory_edges")

    # --- Drop memory_consolidation_logs ---
    op.drop_table("memory_consolidation_logs")

    # --- Drop memory_entries ---
    op.drop_index("ix_memory_entries_memory_type", table_name="memory_entries")
    op.drop_index("ix_memory_scope_tier", table_name="memory_entries")
    op.drop_index(op.f("ix_memory_entries_scope_id"), table_name="memory_entries")
    op.drop_index(op.f("ix_memory_entries_user_id"), table_name="memory_entries")
    op.drop_table("memory_entries")

    # --- Drop conversations.last_memory_extracted_at ---
    op.drop_index("ix_conversations_extraction_scan", table_name="conversations")
    op.drop_column("conversations", "last_memory_extracted_at")

    # --- Drop PostgreSQL enums ---
    sa.Enum(name="edgetype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="memorytype").drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # Re-create enums
    memorytype = sa.Enum("EPISODIC", "SEMANTIC", "PROCEDURAL", name="memorytype")
    memorytype.create(op.get_bind(), checkfirst=True)
    edgetype = sa.Enum(
        "ENTITY_OVERLAP", "SAME_CATEGORY", "SEMANTIC_SIMILARITY", "SAME_TAG",
        name="edgetype",
    )
    edgetype.create(op.get_bind(), checkfirst=True)

    # Re-create conversations.last_memory_extracted_at
    op.add_column(
        "conversations",
        sa.Column("last_memory_extracted_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_conversations_extraction_scan",
        "conversations",
        ["updated_at", "last_memory_extracted_at"],
    )

    # Re-create memory_entries
    op.create_table(
        "memory_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scope", sa.String(length=32), nullable=False),
        sa.Column("scope_id", sa.String(length=36), nullable=False),
        sa.Column("tier", sa.String(length=16), nullable=False),
        sa.Column(
            "memory_type",
            sa.Enum("EPISODIC", "SEMANTIC", "PROCEDURAL", name="memorytype", create_type=False),
            nullable=False,
            server_default="EPISODIC",
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("importance", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("access_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_accessed", sa.DateTime(), nullable=True),
        sa.Column("expired_at", sa.DateTime(), nullable=True),
        sa.Column("last_scored_at", sa.DateTime(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_memory_entries_scope_id"), "memory_entries", ["scope_id"])
    op.create_index(op.f("ix_memory_entries_user_id"), "memory_entries", ["user_id"])
    op.create_index("ix_memory_scope_tier", "memory_entries", ["scope", "scope_id", "tier"])
    op.create_index("ix_memory_entries_memory_type", "memory_entries", ["memory_type"])

    # Re-create memory_consolidation_logs
    op.create_table(
        "memory_consolidation_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scope", sa.String(length=32), nullable=False),
        sa.Column("scope_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("source_entry_ids", sa.JSON(), nullable=False),
        sa.Column("result_entry_id", sa.String(length=36), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Re-create memory_edges
    op.create_table(
        "memory_edges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column(
            "edge_type",
            sa.Enum(
                "ENTITY_OVERLAP", "SAME_CATEGORY", "SEMANTIC_SIMILARITY", "SAME_TAG",
                name="edgetype", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("weight", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("shared_entities", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["memory_entries.id"]),
        sa.ForeignKeyConstraint(["target_id"], ["memory_entries.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_edges_source_id", "memory_edges", ["source_id"])
    op.create_index("ix_memory_edges_target_id", "memory_edges", ["target_id"])
    op.create_index("uq_memory_edges_src_tgt", "memory_edges", ["source_id", "target_id"], unique=True)
