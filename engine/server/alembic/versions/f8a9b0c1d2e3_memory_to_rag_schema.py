"""memory_to_rag_schema

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-03-06

Phase 1 migration for memory-to-RAG pipeline migration:
- User profile fields (preferences, last_profile_synthesis_at)
- Conversation compaction_summary field
- Message full-text search (tsvector + GIN index + trigger)
- RAG chunk usage tracking (access_count, last_accessed, embedding_cache)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- User profile fields ---
    op.add_column("users", sa.Column("preferences", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("last_profile_synthesis_at", sa.DateTime(), nullable=True),
    )

    # --- Conversation compaction_summary ---
    op.add_column(
        "conversations",
        sa.Column("compaction_summary", sa.Text(), nullable=True),
    )

    # Backfill compaction_summary from existing memory entries
    op.execute(
        """
        UPDATE conversations c
        SET compaction_summary = (
            SELECT content
            FROM memory_entries me
            WHERE me.scope = 'conversation'
              AND me.scope_id = c.id
              AND me.tier = 'summary'
              AND me.expired_at IS NULL
            ORDER BY me.created_at DESC
            LIMIT 1
        )
        """
    )

    # --- Message full-text search ---
    op.add_column(
        "conversation_messages",
        sa.Column(
            "search_vector",
            sa.dialects.postgresql.TSVECTOR(),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_message_search_vector",
        "conversation_messages",
        ["search_vector"],
        postgresql_using="gin",
    )

    # Create trigger function for auto-populating search_vector
    op.execute(
        """
        CREATE FUNCTION msg_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content, ''));
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        CREATE TRIGGER msg_search_vector_trigger
        BEFORE INSERT OR UPDATE ON conversation_messages
        FOR EACH ROW EXECUTE FUNCTION msg_search_vector_update();
        """
    )

    # Backfill tsvector for existing messages in batches
    op.execute(
        """
        DO $$
        DECLARE
            batch_size INT := 5000;
            affected INT := 1;
        BEGIN
            WHILE affected > 0 LOOP
                UPDATE conversation_messages
                SET search_vector = to_tsvector('simple', COALESCE(content, ''))
                WHERE id IN (
                    SELECT id FROM conversation_messages
                    WHERE search_vector IS NULL
                    LIMIT batch_size
                );
                GET DIAGNOSTICS affected = ROW_COUNT;
                RAISE NOTICE 'Updated % rows', affected;
            END LOOP;
        END $$;
        """
    )

    # --- RAG chunk usage tracking ---
    op.add_column(
        "rag_chunks",
        sa.Column("access_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "rag_chunks",
        sa.Column("last_accessed", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "rag_chunks",
        sa.Column("embedding_cache", JSONB(), nullable=True),
    )


def downgrade() -> None:
    # --- RAG chunk usage tracking ---
    op.drop_column("rag_chunks", "embedding_cache")
    op.drop_column("rag_chunks", "last_accessed")
    op.drop_column("rag_chunks", "access_count")

    # --- Message full-text search ---
    op.execute("DROP TRIGGER IF EXISTS msg_search_vector_trigger ON conversation_messages;")
    op.execute("DROP FUNCTION IF EXISTS msg_search_vector_update();")
    op.drop_index("ix_message_search_vector", table_name="conversation_messages")
    op.drop_column("conversation_messages", "search_vector")

    # --- Conversation compaction_summary ---
    op.drop_column("conversations", "compaction_summary")

    # --- User profile fields ---
    op.drop_column("users", "last_profile_synthesis_at")
    op.drop_column("users", "preferences")
