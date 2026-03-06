"""
Cross-conversation search indexing.

Indexes conversation messages and summaries into the Qdrant memory
collection for cross-conversation search (à la Claude).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import uuid4

from src.embedding.resolver import get_memory_embedding_provider
from src.infra.config import get_settings
from src.memory.vector_store import QdrantMemoryVectorStore

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = """Summarize the following conversation in 2-4 sentences.
Focus on: the main topic, key decisions, problems discussed, and solutions found.
Return ONLY the summary text, no other formatting.

Conversation:
{messages}"""


class ConversationIndexer:
    """Indexes conversation content into Qdrant for cross-conversation search."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._vector_store = QdrantMemoryVectorStore()

    def _get_embedding_provider(self):
        return get_memory_embedding_provider()

    async def index_message(self, message, conversation) -> None:
        """Embed a single message and upsert to Qdrant memory collection.

        Only indexes user and assistant messages (skips system/tool).
        """
        role = message.role.value if hasattr(message.role, "value") else message.role
        if role not in ("user", "assistant"):
            return

        content = message.content
        if not content or not content.strip():
            return

        embedding_provider = self._get_embedding_provider()
        embedding = await embedding_provider.embed_text(content)

        point_id = str(message.id) if hasattr(message, "id") else str(uuid4())

        await self._vector_store.upsert_entry(
            entry_id=point_id,
            embedding=embedding,
            content=content,
            scope="conversation",
            scope_id=str(conversation.id),
            user_id=str(conversation.user_id),
            conversation_id=str(conversation.id),
            importance=0.5,
            metadata={
                "role": role,
                "agent_id": conversation.agent_id or "",
                "conversation_title": conversation.title or "",
                "timestamp": (
                    message.created_at.isoformat()
                    if hasattr(message, "created_at") and message.created_at
                    else datetime.now(UTC).isoformat()
                ),
            },
        )

    async def index_conversation_summary(
        self,
        conversation_id: str,
        summary: str | None = None,
    ) -> None:
        """Generate (or use provided) summary and upsert to Qdrant.

        Uses scope=CROSS_CONVERSATION so it's searchable across conversations.
        """
        from sqlalchemy import select

        from src.conversations.models import Conversation, ConversationMessage
        from src.infra.database import async_session_maker

        async with async_session_maker() as db:
            # Load conversation
            result = await db.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()
            if not conversation:
                logger.warning("Conversation %s not found", conversation_id)
                return

            user_id = conversation.user_id

            if not summary:
                # Load messages and generate summary via LLM
                msg_result = await db.execute(
                    select(ConversationMessage)
                    .where(ConversationMessage.conversation_id == conversation_id)
                    .order_by(ConversationMessage.created_at)
                )
                messages = msg_result.scalars().all()

                if len(messages) < 3:
                    logger.debug("Conversation %s too short for summary", conversation_id)
                    return

                summary = await self._generate_summary(messages)
                if not summary:
                    return

        # Embed and store
        embedding_provider = self._get_embedding_provider()
        embedding = await embedding_provider.embed_text(summary)

        # Use a deterministic ID based on conversation_id for idempotent upsert
        point_id = f"summary-{conversation_id}"

        await self._vector_store.upsert_entry(
            entry_id=point_id,
            embedding=embedding,
            content=summary,
            scope="cross_conversation",
            scope_id=conversation_id,
            user_id=user_id,
            conversation_id=conversation_id,
            importance=0.7,
            metadata={
                "agent_id": conversation.agent_id or "",
                "conversation_title": conversation.title or "",
                "message_count": len(messages) if 'messages' in dir() else 0,
            },
        )

        logger.info("Indexed summary for conversation %s", conversation_id)

    async def reindex_conversation(self, conversation_id: str) -> int:
        """Bulk reindex all messages for a conversation. Returns count indexed."""
        from sqlalchemy import select

        from src.conversations.models import Conversation, ConversationMessage
        from src.infra.database import async_session_maker

        count = 0
        async with async_session_maker() as db:
            conv_result = await db.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = conv_result.scalar_one_or_none()
            if not conversation:
                return 0

            msg_result = await db.execute(
                select(ConversationMessage)
                .where(ConversationMessage.conversation_id == conversation_id)
                .order_by(ConversationMessage.created_at)
            )
            messages = msg_result.scalars().all()

            for message in messages:
                try:
                    await self.index_message(message, conversation)
                    count += 1
                except Exception as e:  # Graceful degradation: skip failed messages during reindex
                    logger.error("Failed to index message %s: %s", message.id, e)

        return count

    async def _generate_summary(self, messages) -> str | None:
        """Generate a conversation summary via LLM."""
        try:
            from langchain_core.messages import HumanMessage

            from src.llm.provider_factory import LLMProviderFactory

            formatted = []
            for msg in messages:
                role = msg.role.value if hasattr(msg.role, "value") else msg.role
                if role in ("user", "assistant"):
                    formatted.append(f"{role}: {msg.content}")

            if not formatted:
                return None

            # Truncate to last 50 messages
            conversation_text = "\n".join(formatted[-50:])
            prompt = _SUMMARY_PROMPT.format(messages=conversation_text)

            model_id = self._settings.FACT_EXTRACTION_MODEL
            if not model_id:
                model_id = f"{self._settings.DEFAULT_LLM_PROVIDER}:default"

            from src.infra.constants import parse_model_id
            provider_name, model_name = parse_model_id(model_id)

            provider = LLMProviderFactory.get_provider(provider_name)
            if not provider:
                return None

            llm = provider.get_model(model_name, temperature=0.2)
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            return response.content.strip()

        except Exception as e:  # LLM providers raise heterogeneous errors
            logger.error("Summary generation failed: %s", e)
            return None
