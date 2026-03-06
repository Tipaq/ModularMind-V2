"""
Memory Manager.

Manages memory operations for agents including storage, retrieval,
and context formatting.
"""

import logging
import math
from uuid import UUID

from src.embedding.base import IEmbeddingProvider
from src.infra.config import get_settings
from src.infra.utils import utcnow

from .interfaces import IMemoryRepository, MemoryStats
from .models import MemoryEntry, MemoryScope, MemoryTier

logger = logging.getLogger(__name__)


class MemoryManager:
    """Manages memory operations for agents.

    Handles storing new memories, retrieving relevant context,
    and formatting memory for prompts.
    """

    def __init__(
        self,
        repository: IMemoryRepository,
        embedding_provider: IEmbeddingProvider,
        max_context_entries: int = 10,
        similarity_threshold: float = 0.5,
    ):
        """Initialize the memory manager.

        Args:
            repository: Memory repository implementation
            embedding_provider: Provider for generating embeddings
            max_context_entries: Maximum entries to include in context
            similarity_threshold: Minimum similarity for retrieval
        """
        self.repository = repository
        self.embedding_provider = embedding_provider
        self.max_context_entries = max_context_entries
        self.similarity_threshold = similarity_threshold

    async def should_use_memory(
        self,
        scope: MemoryScope,
        scope_id: UUID,
    ) -> bool:
        """Check if memory should be used for this scope.

        Args:
            scope: Memory scope
            scope_id: ID of the scope entity

        Returns:
            True if memory should be used
        """
        try:
            stats = await self.repository.get_stats(scope, scope_id)
            return stats.total_entries > 0
        except Exception as e:  # Resilience: mixed DB + vector store query
            logger.warning(f"Error checking memory stats: {e}")
            return False

    async def get_context(
        self,
        query: str,
        scope: MemoryScope,
        scope_id: UUID,
        user_id: UUID | str | None = None,
        limit: int | None = None,
    ) -> list[MemoryEntry]:
        """Get relevant memory context for a query.

        Args:
            query: Query text to find relevant memories
            scope: Memory scope
            scope_id: ID of the scope entity
            user_id: User ID for scoped search
            limit: Maximum entries to return

        Returns:
            List of relevant memory entries
        """
        limit = limit or self.max_context_entries

        try:
            # Generate query embedding
            query_embedding = await self.embedding_provider.embed_text(query)

            # Cast UUIDs to str for Qdrant payload filtering
            uid = str(user_id) if user_id else str(scope_id)

            # For user-scoped searches (USER_PROFILE, CROSS_CONVERSATION),
            # don't pass scope_id — user_id + scope is sufficient for filtering.
            # The scope_id stored in Qdrant may differ (e.g. "global" for cross_conversation).
            effective_scope_id: str | None = None
            if scope == MemoryScope.AGENT:
                effective_scope_id = str(scope_id)

            # Search via hybrid (dense + BM25)
            results = await self.repository.search_hybrid(
                query_embedding=query_embedding,
                query_text=query,
                user_id=uid,
                scope=scope,
                scope_id=effective_scope_id,
                limit=limit,
                threshold=self.similarity_threshold,
            )

            # Multi-factor scoring (Stanford formula)
            settings = get_settings()
            alpha = settings.MEMORY_SCORE_WEIGHT_RECENCY
            beta = settings.MEMORY_SCORE_WEIGHT_IMPORTANCE
            gamma = settings.MEMORY_SCORE_WEIGHT_RELEVANCE
            delta = settings.MEMORY_SCORE_WEIGHT_FREQUENCY
            now = utcnow()

            # Minimum relevance gate: entries below this Qdrant score are
            # dropped regardless of importance/recency, preventing irrelevant
            # but high-importance memories from polluting results.
            min_relevance = settings.MEMORY_MIN_RELEVANCE_GATE

            scored_entries: list[tuple[MemoryEntry, float]] = []
            for entry, qdrant_score in results:
                # Skip entries that don't meet the relevance floor
                if qdrant_score < min_relevance:
                    logger.debug(
                        "Memory %s dropped: relevance %.3f < gate %.3f",
                        entry.id, qdrant_score, min_relevance,
                    )
                    continue

                # Recency: 0.995 ^ hours_since_access
                ref_time = entry.last_accessed or entry.created_at
                hours_since = (now - ref_time).total_seconds() / 3600
                recency = 0.995 ** max(0, hours_since)

                # Frequency: log-scaled access count
                frequency = min(1.0, math.log(1 + entry.access_count) / math.log(51))

                # Relevance: Qdrant hybrid score (already 0-1 from RRF)
                relevance = qdrant_score

                # Importance: stored importance
                importance = entry.importance

                # Final score
                final_score = (
                    alpha * recency
                    + beta * importance
                    + gamma * relevance
                    + delta * frequency
                )

                scored_entries.append((entry, final_score))

            # Re-sort by final score descending, take top-K
            scored_entries.sort(key=lambda x: x[1], reverse=True)
            scored_entries = scored_entries[:limit]

            # Update access only for returned entries (not dropped ones)
            entries = []
            for entry, score in scored_entries:
                await self.repository.update_access(entry.id)
                entries.append(entry)
                logger.debug("Memory match: %s (score: %.3f)", entry.id, score)

            return entries

        except Exception as e:  # Resilience: mixed embedding + vector search + DB ops
            logger.error(f"Error getting memory context: {e}")
            return []

    async def store_memory(
        self,
        content: str,
        scope: MemoryScope,
        scope_id: UUID,
        tier: MemoryTier = MemoryTier.BUFFER,
        importance: float = 0.5,
        metadata: dict | None = None,
    ) -> MemoryEntry | None:
        """Store a new memory entry.

        Args:
            content: Text content to store
            scope: Memory scope
            scope_id: ID of the scope entity
            tier: Memory tier classification
            importance: Importance score (0-1)
            metadata: Optional additional metadata

        Returns:
            Created memory entry, or None on failure
        """
        try:
            # Generate embedding
            embedding = await self.embedding_provider.embed_text(content)

            # Create entry
            entry = await self.repository.create_entry(
                scope=scope,
                scope_id=scope_id,
                content=content,
                embedding=embedding,
                tier=tier,
                metadata={**(metadata or {}), "importance": importance},
            )

            logger.info(f"Stored memory: {entry.id} (scope: {scope}, tier: {tier})")
            return entry

        except Exception as e:  # Resilience: mixed embedding + DB write ops
            logger.error(f"Error storing memory: {e}")
            return None

    def format_context_for_prompt(
        self,
        entries: list[MemoryEntry],
        max_tokens: int | None = None,
    ) -> str:
        """Format memory entries for inclusion in a prompt.

        Args:
            entries: Memory entries to format
            max_tokens: Optional token limit (approximate)

        Returns:
            Formatted memory context string
        """
        if not entries:
            return ""

        lines = ["### Relevant Memory Context", ""]

        for i, entry in enumerate(entries, 1):
            # Format entry
            content = entry.content
            if max_tokens:
                # Rough token estimate: 1 token ≈ 4 chars
                max_chars = max_tokens * 4 // len(entries)
                if len(content) > max_chars:
                    content = content[:max_chars] + "..."

            lines.append(f"**Memory {i}** ({entry.tier.value}):")
            lines.append(content)
            lines.append("")

        return "\n".join(lines)

    async def extract_memory_from_response(
        self,
        response: str,
        scope: MemoryScope,
        scope_id: UUID,
        user_prompt: str | None = None,
    ) -> MemoryEntry | None:
        """Extract and store relevant memory from a response.

        Analyzes the response for information worth remembering
        and stores it if significant.

        Args:
            response: AI response text
            scope: Memory scope
            scope_id: ID of the scope entity
            user_prompt: Original user prompt for context

        Returns:
            Created memory entry if stored, None otherwise
        """
        # Simple heuristic: store if response contains factual information
        # More sophisticated implementations could use NLP or another LLM call

        # Skip very short responses
        if len(response) < 100:
            return None

        # Look for indicators of memorable content
        memorable_indicators = [
            "remember",
            "important",
            "note that",
            "key point",
            "to summarize",
            "in conclusion",
            "my name is",
            "i prefer",
            "i like",
            "i don't like",
        ]

        response_lower = response.lower()
        is_memorable = any(ind in response_lower for ind in memorable_indicators)

        if not is_memorable:
            return None

        # Store the memory
        metadata = {}
        if user_prompt:
            metadata["trigger_prompt"] = user_prompt[:200]

        return await self.store_memory(
            content=response,
            scope=scope,
            scope_id=scope_id,
            tier=MemoryTier.BUFFER,
            importance=0.6,
            metadata=metadata,
        )

    async def get_stats(
        self,
        scope: MemoryScope,
        scope_id: UUID,
    ) -> MemoryStats:
        """Get memory statistics for a scope.

        Args:
            scope: Memory scope
            scope_id: ID of the scope entity

        Returns:
            Memory statistics
        """
        return await self.repository.get_stats(scope, scope_id)
