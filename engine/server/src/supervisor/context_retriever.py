"""
Context retrieval — memory (user profile) and knowledge (RAG) context for the supervisor.
"""

import logging
from typing import Any

import httpx
from sqlalchemy.exc import SQLAlchemyError

from src.domain_config.provider import ConfigProvider

logger = logging.getLogger(__name__)


async def get_memory_context(user_id: str) -> str:
    """Retrieve user profile context for supervisor inline responses."""
    try:
        from src.auth.models import User
        from src.infra.database import async_session_maker

        async with async_session_maker() as session:
            user = await session.get(User, user_id)
            profile = user.preferences if user else None

        if profile:
            return f"User profile:\n{profile}"
        return ""

    except (SQLAlchemyError, ConnectionError, OSError) as e:
        logger.warning("User profile retrieval for supervisor failed: %s", e, exc_info=True)
        return ""


async def get_knowledge_context(
    query: str,
    conv_config: dict[str, Any],
    config_provider: ConfigProvider,
) -> tuple[str, dict[str, Any] | None]:
    """Retrieve knowledge (RAG) context from agents' collections.

    Collects all RAG collection IDs from enabled agents and performs
    a unified retrieval.  The formatted text is injected into the
    supervisor's routing prompt so it can answer directly when
    the knowledge is sufficient.

    Returns:
        Tuple of (formatted_text, knowledge_data_dict_or_None).
    """
    try:
        from sqlalchemy import select as sa_select

        from src.embedding.resolver import get_knowledge_embedding_provider
        from src.infra.database import async_session_maker
        from src.rag.models import RAGCollection
        from src.rag.repository import RAGRepository
        from src.rag.retriever import RAGRetriever

        # Collect collection IDs from enabled agents that have RAG
        agents = await config_provider.list_agents()
        enabled = conv_config.get("enabled_agents")
        if enabled:
            agents = [a for a in agents if a.id in enabled]

        all_collection_ids = []
        for agent in agents:
            if (
                agent.rag_config
                and agent.rag_config.enabled
                and agent.rag_config.collection_ids
            ):
                all_collection_ids.extend(agent.rag_config.collection_ids)

        if not all_collection_ids:
            return "", None

        # Deduplicate
        all_collection_ids = list(dict.fromkeys(all_collection_ids))

        embedding_provider = get_knowledge_embedding_provider()
        if embedding_provider is None:
            return "", None

        async with async_session_maker() as session:
            repo = RAGRepository(session)
            from src.rag.retriever import RetrievalQuery

            retriever = RAGRetriever(repo, embedding_provider, default_limit=5)
            retrieval_query = RetrievalQuery(
                query=query,
                user_id="",
                collection_ids=all_collection_ids,
                limit=5,
                threshold=0.3,
            )
            raw_results = await retriever.retrieve_raw(retrieval_query)

            if not raw_results:
                return "", None

            # Hydrate collection names
            coll_ids = {r.collection_id for r in raw_results}
            rows = await session.execute(
                sa_select(RAGCollection.id, RAGCollection.name).where(
                    RAGCollection.id.in_(coll_ids)
                )
            )
            coll_map = {row[0]: row[1] for row in rows.all()}

            # Build serialisable results for frontend
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

            knowledge_data = {
                "collections": list(collections_seen.values()),
                "chunks": chunks,
                "total_results": len(raw_results),
            }

            formatted = retriever.format_context(raw_results)
            logger.info(
                "Knowledge context: %d results from %d collections",
                len(raw_results),
                len(collections_seen),
            )
            return formatted, knowledge_data

    except (
        SQLAlchemyError,
        httpx.HTTPError,
        ConnectionError,
        TimeoutError,
        RuntimeError,
        ValueError,
    ) as e:
        logger.warning("Knowledge retrieval for supervisor failed: %s", e, exc_info=True)
        return "", None
