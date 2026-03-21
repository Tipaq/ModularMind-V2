"""
Agent Context Builder — retrieves memory and RAG context for agents.

Produces context strings that are injected as additional SystemMessages
between the agent's system_prompt and the conversation messages.  Both
memory and RAG retrieval are fail-safe: errors are logged and result in
empty context (the agent still works, just without augmentation).
"""

import logging
from typing import Any

from langchain_core.messages import SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from src.graph_engine.interfaces import AgentConfig
from src.infra.config import get_settings

logger = logging.getLogger(__name__)


class AgentContextBuilder:
    """Builds context SystemMessages for an agent.

    Must be called **before** graph compilation (in the worker task or
    inline handler) because it needs an async DB session and embedding
    provider.
    """

    def __init__(self) -> None:
        self._last_rag_results: list[Any] = []
        self._last_history_count: int = 0
        self.last_history_budget: dict[str, Any] = {}
        self._last_history_messages: list[dict[str, str]] = []
        self._last_summary_text: str = ""
        self._last_user_profile: str | None = None
        self._last_budget_overview: dict[str, Any] = {}

    async def build_context_messages(
        self,
        agent: AgentConfig,
        query: str,
        session: AsyncSession,
        user_id: str | None = None,
        conversation_id: str | None = None,
        model_id: str | None = None,
        system_prompt_chars: int = 0,
    ) -> list[SystemMessage]:
        """Build context SystemMessages for an agent.

        Returns an empty list if neither memory nor RAG is enabled or
        if retrieval fails.
        """
        self._last_rag_results = []
        self._last_history_count = 0
        self.last_history_budget = {}
        self._last_history_messages = []
        self._last_summary_text = ""
        self._last_user_profile = None
        self._last_budget_overview = {}
        messages: list[SystemMessage] = []

        # Resolve model context_window and compute per-layer budgets
        settings = get_settings()
        effective_model_id = model_id or agent.model_id or ""
        context_window = (
            self.resolve_context_window(effective_model_id)
            if effective_model_id
            else settings.CONTEXT_BUDGET_DEFAULT_CONTEXT_WINDOW
        )

        # Apply soft limit: cap effective context to max_pct of full window
        max_pct = getattr(settings, "CONTEXT_BUDGET_MAX_PCT", 100.0)
        effective_context = int(context_window * max_pct / 100)

        history_budget = int(effective_context * settings.CONTEXT_BUDGET_HISTORY_PCT / 100)
        profile_budget = int(effective_context * settings.CONTEXT_BUDGET_PROFILE_PCT / 100)
        rag_budget = int(effective_context * settings.CONTEXT_BUDGET_RAG_PCT / 100)
        system_budget = int(effective_context * settings.CONTEXT_BUDGET_SYSTEM_PCT / 100)

        # Track actual token usage per layer
        history_used = 0
        profile_used = 0
        rag_used = 0
        system_used = system_prompt_chars // 4

        # Inject recent conversation history for continuity
        if conversation_id:
            history_text = await self._get_conversation_history(
                conversation_id,
                session,
                max_tokens=history_budget,
                context_window=context_window,
                history_pct=settings.CONTEXT_BUDGET_HISTORY_PCT,
            )
            if history_text:
                messages.append(SystemMessage(content=history_text))
                history_used = len(history_text) // 4

        if agent.memory_enabled:
            memory_text = await self._get_memory_context(
                agent,
                query,
                session,
                user_id,
                max_tokens=profile_budget,
            )
            if memory_text:
                messages.append(SystemMessage(content=memory_text))
                profile_used = len(memory_text) // 4

        if agent.rag_config and agent.rag_config.enabled and agent.rag_config.collection_ids:
            rag_text = await self._get_rag_context(
                agent,
                query,
                session,
                user_id,
                max_total_chars=rag_budget * 4,
            )
            if rag_text:
                messages.append(SystemMessage(content=rag_text))
                rag_used = len(rag_text) // 4

        # Store full budget overview for frontend
        self._last_budget_overview = {
            "context_window": context_window,
            "effective_context": effective_context,
            "max_pct": max_pct,
            "layers": {
                "history": {
                    "pct": settings.CONTEXT_BUDGET_HISTORY_PCT,
                    "allocated": history_budget,
                    "used": history_used,
                },
                "memory": {
                    "pct": settings.CONTEXT_BUDGET_PROFILE_PCT,
                    "allocated": profile_budget,
                    "used": profile_used,
                },
                "rag": {
                    "pct": settings.CONTEXT_BUDGET_RAG_PCT,
                    "allocated": rag_budget,
                    "used": rag_used,
                },
                "system": {
                    "pct": settings.CONTEXT_BUDGET_SYSTEM_PCT,
                    "allocated": system_budget,
                    "used": system_used,
                },
            },
        }

        return messages

    def get_rag_results(self) -> list[dict[str, Any]]:
        """Return raw RAG results from the last build, serialised for SSE."""
        return self._last_rag_results

    def get_history_message_count(self) -> int:
        """Return number of conversation messages included in last build."""
        return self._last_history_count

    def get_context_details(self) -> dict[str, Any]:
        """Return full context injection details for frontend display."""
        return {
            "history": {
                "budget": self.last_history_budget,
                "messages": self._last_history_messages,
                "summary": self._last_summary_text,
            },
            "user_profile": self._last_user_profile,
            "budget_overview": self._last_budget_overview,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def resolve_context_window(model_id: str) -> int:
        """Resolve context_window for a model_id like 'ollama:llama3.2'.

        Looks up the model catalog (JSON files) to find the context_window.
        Falls back to CONTEXT_BUDGET_DEFAULT_CONTEXT_WINDOW if not found.
        """
        try:
            from src.models.service import RuntimeModelService

            service = RuntimeModelService()
            parts = model_id.split(":", 1)
            if len(parts) == 2:
                provider, model_name = parts

                # Cloud models are seeded as "provider-model" with dots replaced.
                # Ollama models are seeded as "model_name" with only colons replaced
                # (dots kept).  Try both conventions.

                # 1) Cloud format: "openai-gpt-4o" (dots → hyphens)
                catalog_id = f"{provider}-{model_name}".replace(":", "-").replace(".", "-")
                model = service.get_model(catalog_id)

                # 2) Ollama format: "qwen2.5-latest" (dots kept)
                if not model:
                    catalog_id = model_name.replace(":", "-")
                    model = service.get_model(catalog_id)

                # 3) Try base-latest: "qwen2.5-latest" (dots kept)
                if not model:
                    base = model_name.rsplit(":", 1)[0] if ":" in model_name else model_name
                    catalog_id = f"{base}-latest"
                    model = service.get_model(catalog_id)

                # 4) Same fallbacks but with dots replaced
                if not model:
                    catalog_id = model_name.replace(":", "-").replace(".", "-")
                    model = service.get_model(catalog_id)
                if not model:
                    base = model_name.rsplit(":", 1)[0] if ":" in model_name else model_name
                    catalog_id = f"{base}-latest".replace(".", "-")
                    model = service.get_model(catalog_id)

                # 5) Last resort: scan all catalog models for matching base name
                if not model:
                    base = model_name.rsplit(":", 1)[0] if ":" in model_name else model_name
                    for entry in service.list_models():
                        entry_name = entry.get("model_id", "") or entry.get("model_name", "")
                        entry_base = (
                            entry_name.rsplit(":", 1)[0] if ":" in entry_name else entry_name
                        )
                        if entry_base == base and entry.get("context_window"):
                            model = entry
                            break

                if model and model.get("context_window"):
                    return model["context_window"]
        except Exception as e:
            logger.debug("Could not resolve context_window for %s: %s", model_id, e)
        return get_settings().CONTEXT_BUDGET_DEFAULT_CONTEXT_WINDOW

    async def _get_conversation_history(
        self,
        conversation_id: str,
        session: AsyncSession,
        *,
        max_tokens: int = 2000,
        context_window: int = 8192,
        history_pct: float = 30.0,
    ) -> str:
        """Load recent conversation messages for immediate context continuity.

        Builds a rolling window: if messages exceed the token budget,
        older messages are replaced by a SUMMARY entry if one exists.

        Respects context compaction: if ``config["compacted_before_message_id"]``
        is set on the conversation, only messages after that point are loaded
        and the compaction summary is always prepended.
        """
        try:
            from sqlalchemy import select

            from src.conversations.models import Conversation, ConversationMessage

            max_chars = max_tokens * 4  # ~4 chars/token

            # Check for compaction boundary in conversation config
            compacted_before_id: str | None = None
            try:
                conv_result = await session.execute(
                    select(Conversation.config).where(Conversation.id == conversation_id)
                )
                conv_config = conv_result.scalar_one_or_none() or {}
                compacted_before_id = conv_config.get("compacted_before_message_id")
            except Exception:
                pass  # Best-effort

            # Build message query — skip compacted messages if boundary exists
            msg_query = select(ConversationMessage).where(
                ConversationMessage.conversation_id == conversation_id
            )
            if compacted_before_id:
                try:
                    cutoff_result = await session.execute(
                        select(ConversationMessage.created_at).where(
                            ConversationMessage.id == compacted_before_id
                        )
                    )
                    cutoff_time = cutoff_result.scalar_one_or_none()
                    if cutoff_time:
                        msg_query = msg_query.where(
                            ConversationMessage.created_at > cutoff_time,
                        )
                except Exception:
                    pass  # Fall back to loading all messages

            # Load recent messages (newest first, then reverse).
            # Safety limit of 200 rows to avoid loading entire conversation.
            # Skip the first (newest) row — it's the current user message that
            # will already be injected as the HumanMessage in the graph state.
            result = await session.execute(
                msg_query.order_by(ConversationMessage.created_at.desc()).limit(201)
            )
            rows = list(result.scalars().all())
            if rows:
                rows = rows[1:]  # drop the current user message
            if not rows:
                return ""

            rows.reverse()  # chronological order

            # Fill budget from most recent messages backwards
            lines: list[str] = []
            total_chars = 0
            budget_exceeded = False

            for msg in reversed(rows):
                role = msg.role.value if hasattr(msg.role, "value") else msg.role
                content = msg.content or ""
                line = f"**{role}**: {content}"
                if total_chars + len(line) > max_chars:
                    budget_exceeded = True
                    break
                lines.append(line)
                total_chars += len(line)

            if not lines:
                return ""

            lines.reverse()  # back to chronological

            # Prepend summary if compacted OR if budget exceeded
            summary_prefix = ""
            if compacted_before_id or budget_exceeded:
                try:
                    summary_result = await session.execute(
                        select(Conversation.compaction_summary).where(
                            Conversation.id == conversation_id
                        )
                    )
                    summary_text = summary_result.scalar_one_or_none()
                    if summary_text:
                        summary_prefix = f"**Earlier context (summary)**: {summary_text}\n\n---\n\n"
                        self._last_summary_text = summary_text
                except Exception:
                    pass  # Summary lookup is best-effort

            self._last_history_count = len(lines)
            self.last_history_budget = {
                "included_count": len(lines),
                "total_chars": total_chars,
                "max_chars": max_chars,
                "budget_exceeded": budget_exceeded,
                "context_window": context_window,
                "history_budget_pct": history_pct,
                "history_budget_tokens": max_tokens,
            }
            self._last_history_messages = []
            for line in lines:
                # Lines are formatted as "**role**: content"
                if line.startswith("**") and "**: " in line:
                    role_end = line.index("**: ")
                    role = line[2:role_end]
                    content = line[role_end + 4 :]
                    self._last_history_messages.append(
                        {
                            "role": role,
                            "content": content[:200],
                        }
                    )

            parts = ["### Recent Conversation History\n"]
            if summary_prefix:
                parts.append(summary_prefix)
            parts.append("\n".join(lines))
            parts.append(
                "\n\n(Use this conversation history for context. The user's new message follows.)"
            )
            return "\n".join(parts)

        except Exception as e:
            logger.warning("Conversation history retrieval failed: %s", e)
            return ""

    async def _get_memory_context(
        self,
        agent: AgentConfig,  # vestigial — kept for call-site signature stability
        query: str,  # vestigial — kept for call-site signature stability
        session: AsyncSession,
        user_id: str | None,
        *,
        max_tokens: int = 2000,
    ) -> str:
        """Load user profile preferences and inject as context."""
        if not user_id:
            return ""
        try:
            from sqlalchemy import select

            from src.auth.models import User

            result = await session.execute(select(User.preferences).where(User.id == user_id))
            preferences = result.scalar_one_or_none()
            if not preferences:
                return ""

            # Truncate to budget (max_tokens * 4 chars ≈ max_tokens tokens)
            max_chars = max_tokens * 4
            if len(preferences) > max_chars:
                preferences = preferences[:max_chars]

            return f"## User Profile\n{preferences}"

        except Exception as e:
            logger.warning("User profile retrieval failed for user %s: %s", user_id, e)
            return ""

    async def _get_rag_context(
        self,
        agent: AgentConfig,
        query: str,
        session: AsyncSession,
        user_id: str | None,
        *,
        max_total_chars: int | None = None,
    ) -> str:
        """Retrieve RAG context for the agent."""
        try:
            from sqlalchemy import select

            from src.rag.models import RAGCollection
            from src.rag.repository import RAGRepository
            from src.rag.retriever import RAGRetriever

            embedding_provider = self._get_knowledge_embedding_provider()
            if embedding_provider is None:
                return ""

            repo = RAGRepository(session)
            retriever = RAGRetriever(
                repo,
                embedding_provider,
                default_limit=agent.rag_config.retrieval_count,
                default_threshold=agent.rag_config.similarity_threshold,
            )
            raw_results = await retriever.retrieve_raw(
                query=query,
                user_id=user_id or "",
                collection_ids=agent.rag_config.collection_ids,
                limit=agent.rag_config.retrieval_count,
                threshold=agent.rag_config.similarity_threshold,
            )

            if not raw_results:
                return ""

            # Hydrate collection names
            coll_ids = {r.collection_id for r in raw_results}
            rows = await session.execute(
                select(RAGCollection.id, RAGCollection.name).where(RAGCollection.id.in_(coll_ids))
            )
            coll_map = {row[0]: row[1] for row in rows.all()}

            # Build serialisable results for the frontend
            collections_seen: dict[str, dict[str, Any]] = {}
            chunks: list[dict[str, Any]] = []
            for r in raw_results:
                cid = r.collection_id
                cname = coll_map.get(cid, "Unknown")
                if cid not in collections_seen:
                    collections_seen[cid] = {
                        "collection_id": cid,
                        "collection_name": cname,
                        "chunk_count": 0,
                    }
                collections_seen[cid]["chunk_count"] += 1
                chunks.append(
                    {
                        "chunk_id": r.chunk_id,
                        "document_id": r.document_id,
                        "collection_id": cid,
                        "collection_name": cname,
                        "document_filename": r.document.filename if r.document else None,
                        "content_preview": (r.content or "")[:300],
                        "score": round(r.score, 4),
                        "chunk_index": r.chunk_index,
                    }
                )

            self._last_rag_results = [
                {
                    "collections": list(collections_seen.values()),
                    "chunks": chunks,
                    "total_results": len(raw_results),
                }
            ]

            logger.info("Found %d RAG results for agent %s", len(raw_results), agent.id)
            return retriever.format_context(
                raw_results,
                max_total_chars=max_total_chars,
            )

        except Exception as e:
            logger.warning(
                "RAG retrieval failed for agent %s: %s",
                agent.id,
                e,
            )
            return ""

    @staticmethod
    def _get_knowledge_embedding_provider():
        """Get the embedding provider for RAG / knowledge context."""
        try:
            from src.embedding.resolver import get_knowledge_embedding_provider

            return get_knowledge_embedding_provider()
        except Exception as e:
            logger.warning("Could not initialise knowledge embedding provider: %s", e)
            return None
