"""Context compaction service — summarize old messages via LLM.

Implements Claude-style context compaction: older messages that fall outside
the token budget are summarized by the agent's own LLM.  The summary replaces
those messages in the context window while originals stay in the database.

Supports incremental compaction: when re-compacting, the previous summary is
included as prior context so new summaries build on top of old ones.
"""

import logging
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.conversations.models import Conversation, ConversationMessage
from src.infra.config import get_settings
from src.infra.utils import utcnow
from src.memory.models import (
    ConsolidationLog,
    MemoryEntry,
    MemoryScope,
    MemoryTier,
    MemoryType,
)
from src.memory.repository import MemoryRepository

logger = logging.getLogger(__name__)

_COMPACTION_PROMPT = """\
You are summarizing an earlier portion of a conversation to preserve context.

Create a comprehensive summary that preserves:
- Key topics discussed and conclusions reached
- Important decisions made and their rationale
- Specific facts, numbers, code snippets, or technical details mentioned
- User preferences, constraints, or requirements expressed
- Action items or commitments
- Any context needed to continue the conversation naturally

Write in third person, past tense.  Be thorough but concise.
Do NOT include preamble like "Here is a summary" — just write the summary directly.

{context}

Summary:"""


class CompactionService:
    """Compacts conversation history into an LLM-generated summary."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def compact(
        self,
        conversation_id: str,
        model_id: str,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Compact messages outside the budget window into a summary.

        Args:
            conversation_id: The conversation to compact.
            model_id: Agent model ID (e.g. "ollama:llama3.2" or "openai:gpt-4o").
            user_id: Owner user ID (for MemoryEntry).

        Returns:
            dict with summary_preview, compacted_count, duration_ms.
        """
        start = time.monotonic()
        settings = get_settings()

        conv = await self.session.get(Conversation, conversation_id)
        if not conv:
            raise ValueError(f"Conversation {conversation_id} not found")

        config: dict = conv.config or {}
        compacted_before_id: str | None = config.get("compacted_before_message_id")

        # Load messages after the compaction boundary (or all if no boundary)
        query = (
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
        )
        if compacted_before_id:
            cutoff = await self.session.execute(
                select(ConversationMessage.created_at)
                .where(ConversationMessage.id == compacted_before_id)
            )
            cutoff_time = cutoff.scalar_one_or_none()
            if cutoff_time:
                query = query.where(ConversationMessage.created_at > cutoff_time)

        query = query.order_by(ConversationMessage.created_at.asc())
        result = await self.session.execute(query)
        messages = list(result.scalars().all())

        if len(messages) < 4:
            return {"summary_preview": "", "compacted_count": 0, "duration_ms": 0}

        # Determine budget boundary — keep last N messages that fit
        max_chars = int(
            settings.CONTEXT_BUDGET_DEFAULT_CONTEXT_WINDOW
            * settings.CONTEXT_BUDGET_HISTORY_PCT / 100
            * 4  # tokens → chars
        )
        kept_ids: set[str] = set()
        total = 0
        for msg in reversed(messages):
            line_len = len(f"**{msg.role.value}**: {msg.content or ''}")
            if total + line_len > max_chars:
                break
            kept_ids.add(msg.id)
            total += line_len

        compactable = [m for m in messages if m.id not in kept_ids]
        if len(compactable) < 2:
            return {"summary_preview": "", "compacted_count": 0, "duration_ms": 0}

        # Format messages for the LLM
        formatted = []
        for msg in compactable:
            role = msg.role.value if hasattr(msg.role, "value") else msg.role
            content = msg.content or ""
            if role in ("user", "assistant") and content.strip():
                formatted.append(f"{role}: {content}")

        if not formatted:
            return {"summary_preview": "", "compacted_count": 0, "duration_ms": 0}

        conversation_text = "\n".join(formatted[-80:])  # Cap at ~80 messages

        # Include existing summary for incremental compaction
        existing_summary = await self._get_existing_summary(conversation_id)
        if existing_summary:
            context_block = (
                f"[Previous context summary]:\n{existing_summary}\n\n"
                f"[New messages to incorporate]:\n{conversation_text}"
            )
        else:
            context_block = f"Conversation:\n{conversation_text}"

        prompt = _COMPACTION_PROMPT.format(context=context_block)

        # Call the agent's LLM
        summary_text = await self._call_llm(model_id, prompt)
        if not summary_text:
            raise RuntimeError("LLM returned empty summary")

        # Store summary as MemoryEntry, expire previous
        await self._store_summary(
            conversation_id=conversation_id,
            summary_text=summary_text,
            agent_id=conv.agent_id,
            user_id=user_id or conv.user_id,
            message_count=len(compactable),
        )

        # Update compaction boundary in conversation config
        last_compacted = compactable[-1]
        new_config = {**config, "compacted_before_message_id": last_compacted.id}
        conv.config = new_config

        # Log for monitoring (Ops ConsolidationTab)
        self.session.add(ConsolidationLog(
            scope="conversation",
            scope_id=conversation_id,
            action="compacted",
            source_entry_ids=[m.id for m in compactable[:20]],  # Cap for DB
            details={
                "compacted_count": len(compactable),
                "summary_chars": len(summary_text),
                "model_id": model_id,
                "incremental": bool(existing_summary),
            },
        ))

        await self.session.flush()

        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "Compacted %d messages for conversation %s in %dms",
            len(compactable), conversation_id, elapsed_ms,
        )

        return {
            "summary_preview": summary_text[:300],
            "compacted_count": len(compactable),
            "duration_ms": elapsed_ms,
        }

    async def _get_existing_summary(self, conversation_id: str) -> str:
        """Get the current active SUMMARY for this conversation."""
        result = await self.session.execute(
            select(MemoryEntry)
            .where(
                MemoryEntry.scope == MemoryScope.CONVERSATION,
                MemoryEntry.scope_id == conversation_id,
                MemoryEntry.tier == MemoryTier.SUMMARY,
                MemoryEntry.expired_at.is_(None),
            )
            .order_by(MemoryEntry.created_at.desc())
            .limit(1)
        )
        entry = result.scalar_one_or_none()
        return entry.content if entry else ""

    async def _call_llm(self, model_id: str, prompt: str) -> str:
        """Call the agent's LLM for summarization."""
        from langchain_core.messages import HumanMessage

        from src.infra.constants import parse_model_id
        from src.llm.provider_factory import LLMProviderFactory

        provider_name, model_name = parse_model_id(model_id)
        provider = LLMProviderFactory.get_provider(provider_name)
        if not provider:
            raise RuntimeError(f"No LLM provider available: {provider_name}")

        llm = await provider.get_model(model_name, temperature=0.1)
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        return response.content.strip()

    async def _store_summary(
        self,
        conversation_id: str,
        summary_text: str,
        agent_id: str | None,
        user_id: str | None,
        message_count: int,
    ) -> None:
        """Store summary as MemoryEntry, expiring previous summaries."""
        # Expire previous summaries
        prev = await self.session.execute(
            select(MemoryEntry).where(
                MemoryEntry.scope == MemoryScope.CONVERSATION,
                MemoryEntry.scope_id == conversation_id,
                MemoryEntry.tier == MemoryTier.SUMMARY,
                MemoryEntry.expired_at.is_(None),
            )
        )
        now = utcnow()
        for old in prev.scalars().all():
            old.expired_at = now

        # Generate embedding (best-effort)
        embedding = None
        try:
            from src.embedding.resolver import get_memory_embedding_provider

            ep = get_memory_embedding_provider()
            if ep:
                embedding = await ep.embed_query(summary_text)
        except Exception as e:
            logger.warning("Embedding failed for compaction summary: %s", e)

        repo = MemoryRepository(self.session)
        await repo.create_entry(
            scope=MemoryScope.CONVERSATION,
            scope_id=conversation_id,
            content=summary_text,
            embedding=embedding,
            tier=MemoryTier.SUMMARY,
            metadata={
                "agent_id": agent_id or "",
                "message_count": message_count,
                "source": "context_compaction",
            },
            user_id=user_id,
            importance=0.8,
            memory_type=MemoryType.EPISODIC,
        )
