"""
Agent Context Builder — retrieves memory and RAG context for agents.

Produces context strings that are injected as additional SystemMessages
between the agent's system_prompt and the conversation messages.  Both
memory and RAG retrieval are fail-safe: errors are logged and result in
empty context (the agent still works, just without augmentation).
"""

import logging
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

            embedding_provider = self._get_embedding_provider()
            if embedding_provider is None:
                return ""

            repo = MemoryRepository(session)
            manager = MemoryManager(repo, embedding_provider)

            entries = await manager.get_context(
                query=query,
                scope=MemoryScope.AGENT,
                scope_id=UUID(str(agent.id)),
                user_id=user_id,
                limit=5,
            )
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
            from src.rag.repository import RAGRepository
            from src.rag.retriever import RAGRetriever

            embedding_provider = self._get_embedding_provider()
            if embedding_provider is None:
                return ""

            repo = RAGRepository(session)
            retriever = RAGRetriever(
                repo,
                embedding_provider,
                default_limit=agent.rag_config.retrieval_count,
                default_threshold=agent.rag_config.similarity_threshold,
            )
            return await retriever.retrieve(
                query=query,
                user_id=user_id or "",
                collection_ids=agent.rag_config.collection_ids,
                limit=agent.rag_config.retrieval_count,
                threshold=agent.rag_config.similarity_threshold,
            )

        except Exception as e:
            logger.warning(
                "RAG retrieval failed for agent %s: %s", agent.id, e,
            )
            return ""

    @staticmethod
    def _get_embedding_provider():
        """Get the embedding provider (reuses tasks.py singleton pattern)."""
        try:
            from src.embedding import get_embedding_provider
            from src.infra.config import get_settings

            settings = get_settings()
            return get_embedding_provider(
                settings.EMBEDDING_PROVIDER,
                base_url=settings.OLLAMA_BASE_URL,
                model=settings.EMBEDDING_MODEL,
            )
        except Exception as e:
            logger.warning("Could not initialise embedding provider: %s", e)
            return None
