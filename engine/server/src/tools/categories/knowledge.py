"""Knowledge/RAG tools — search and list document collections."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


def get_knowledge_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for knowledge category."""
    return [
        {
            "type": "function",
            "function": {
                "name": "knowledge_search",
                "description": (
                    "Search the knowledge base for relevant information from uploaded "
                    "documents. Uses semantic (vector) + keyword (BM25) hybrid search "
                    "across all accessible collections. Returns relevant text chunks "
                    "with source attribution."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query to find relevant documents.",
                        },
                        "collection_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "Optional list of collection IDs to search in. "
                                "Omit to search all accessible collections."
                            ),
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results to return (1-20, default 5).",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "knowledge_list_sources",
                "description": (
                    "List available knowledge collections and their documents. "
                    "Shows collection names, descriptions, document counts, and scopes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "scope": {
                            "type": "string",
                            "enum": ["global", "group", "agent"],
                            "description": "Filter by scope (omit for all accessible).",
                        },
                    },
                    "required": [],
                },
            },
        },
    ]


async def execute_knowledge_tool(
    name: str,
    args: dict[str, Any],
    user_id: str,
    session: AsyncSession,
    rag_retriever: Any | None = None,
) -> str:
    """Execute a knowledge tool."""
    if name == "knowledge_search":
        return await _knowledge_search(args, user_id, session, rag_retriever)
    if name == "knowledge_list_sources":
        return await _knowledge_list_sources(args, user_id, session)
    return f"Error: unknown knowledge tool '{name}'"


async def _knowledge_search(
    args: dict,
    user_id: str,
    session: AsyncSession,
    rag_retriever: Any | None,
) -> str:
    """Search knowledge base using RAG retriever."""
    if not rag_retriever:
        return "Error: knowledge search is not configured (no embedding provider)."

    query = args.get("query", "").strip()
    if not query:
        return "Error: query parameter is required."

    from src.rag.retriever import RetrievalQuery

    collection_ids = args.get("collection_ids")
    limit = min(max(int(args.get("limit", 5)), 1), 20)

    retrieval_query = RetrievalQuery(
        query=query,
        user_id=user_id,
        collection_ids=collection_ids,
        limit=limit,
    )
    context = await rag_retriever.retrieve(retrieval_query)

    if not context:
        return "No relevant documents found."

    return context


async def _knowledge_list_sources(
    args: dict,
    user_id: str,
    session: AsyncSession,
) -> str:
    """List accessible knowledge collections."""
    from sqlalchemy import select as sa_select

    from src.rag.models import RAGCollection

    scope_filter = args.get("scope")

    query = sa_select(RAGCollection).order_by(RAGCollection.created_at.desc())

    if scope_filter:
        query = query.where(RAGCollection.scope == scope_filter)

    result = await session.execute(query)
    collections = list(result.scalars().all())

    if not collections:
        return "No knowledge collections found."

    parts = []
    for col in collections:
        scope_str = col.scope.value if hasattr(col.scope, "value") else str(col.scope)
        parts.append(
            f"- **{col.name}** (id: {col.id})\n"
            f"  Scope: {scope_str} | Documents: {col.document_count} | "
            f"Chunks: {col.chunk_count}\n"
            f"  {col.description or 'No description'}"
        )

    return "\n".join(parts)
