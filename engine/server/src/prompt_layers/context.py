"""
Agent Context Builder — retrieves memory and RAG context for agents.

Produces context strings that are injected as additional SystemMessages
between the agent's system_prompt and the conversation messages.  Both
memory and RAG retrieval are fail-safe: errors are logged and result in
empty context (the agent still works, just without augmentation).
"""

import logging
from typing import Any
from uuid import UUID

from langchain_core.messages import SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from src.graph_engine.interfaces import AgentConfig

logger = logging.getLogger(__name__)


class AgentContextBuilder:
    """Builds context SystemMessages for an agent.

    Must be called **before** graph compilation (in the worker task or
    inline handler) because it needs an async DB session and embedding
    provider.
    """

    def __init__(self) -> None:
        self._last_rag_results: list[Any] = []

    async def build_context_messages(
        self,
        agent: AgentConfig,
        query: str,
        session: AsyncSession,
        user_id: str | None = None,
    ) -> list[SystemMessage]:
        """Build context SystemMessages for an agent.

        Returns an empty list if neither memory nor RAG is enabled or
        if retrieval fails.
        """
        self._last_rag_results = []
        messages: list[SystemMessage] = []

        if agent.memory_enabled:
            memory_text = await self._get_memory_context(
                agent, query, session, user_id,
            )
            if memory_text:
                messages.append(SystemMessage(content=memory_text))

        if agent.rag_config and agent.rag_config.enabled and agent.rag_config.collection_ids:
            rag_text = await self._get_rag_context(
                agent, query, session, user_id,
            )
            if rag_text:
                messages.append(SystemMessage(content=rag_text))

        return messages

    def get_rag_results(self) -> list[dict[str, Any]]:
        """Return raw RAG results from the last build, serialised for SSE."""
        return self._last_rag_results

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_memory_context(
        self,
        agent: AgentConfig,
        query: str,
        session: AsyncSession,
        user_id: str | None,
    ) -> str:
        """Retrieve memory context for the agent."""
        try:
            from src.memory.manager import MemoryManager
            from src.memory.models import MemoryScope
            from src.memory.repository import MemoryRepository

            embedding_provider = self._get_memory_embedding_provider()
            if embedding_provider is None:
                return ""

            repo = MemoryRepository(session)
            manager = MemoryManager(repo, embedding_provider)

            entries = await manager.get_context(
                query=query,
                scope=MemoryScope.AGENT,
                scope_id=UUID(str(agent.id)),
                user_id=user_id,
                limit=3,
            )

            # Also search user profile memories (facts extracted from conversations)
            if user_id:
                profile_entries = await manager.get_context(
                    query=query,
                    scope=MemoryScope.USER_PROFILE,
                    scope_id=UUID(user_id) if len(user_id) == 36 else UUID(int=0),
                    user_id=user_id,
                    limit=3,
                )
                all_entries = entries + profile_entries
                seen: set[str] = set()
                unique = []
                for e in all_entries:
                    eid = str(e.id)
                    if eid not in seen:
                        seen.add(eid)
                        unique.append(e)
                entries = unique[:5]

            return manager.format_context_for_prompt(entries, max_tokens=2000)

        except Exception as e:
            logger.warning(
                "Memory retrieval failed for agent %s: %s", agent.id, e,
            )
            return ""

    async def _get_rag_context(
        self,
        agent: AgentConfig,
        query: str,
        session: AsyncSession,
        user_id: str | None,
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
                select(RAGCollection.id, RAGCollection.name).where(
                    RAGCollection.id.in_(coll_ids)
                )
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
                chunks.append({
                    "chunk_id": r.chunk_id,
                    "document_id": r.document_id,
                    "collection_id": cid,
                    "collection_name": cname,
                    "document_filename": r.document.filename if r.document else None,
                    "content_preview": (r.content or "")[:300],
                    "score": round(r.score, 4),
                    "chunk_index": r.chunk_index,
                })

            self._last_rag_results = [{
                "collections": list(collections_seen.values()),
                "chunks": chunks,
                "total_results": len(raw_results),
            }]

            logger.info("Found %d RAG results for agent %s", len(raw_results), agent.id)
            return retriever.format_context(raw_results)

        except Exception as e:
            logger.warning(
                "RAG retrieval failed for agent %s: %s", agent.id, e,
            )
            return ""

    @staticmethod
    def _get_memory_embedding_provider():
        """Get the embedding provider for memory context."""
        try:
            from src.embedding.resolver import get_memory_embedding_provider
            return get_memory_embedding_provider()
        except Exception as e:
            logger.warning("Could not initialise memory embedding provider: %s", e)
            return None

    @staticmethod
    def _get_knowledge_embedding_provider():
        """Get the embedding provider for RAG / knowledge context."""
        try:
            from src.embedding.resolver import get_knowledge_embedding_provider
            return get_knowledge_embedding_provider()
        except Exception as e:
            logger.warning("Could not initialise knowledge embedding provider: %s", e)
            return None
