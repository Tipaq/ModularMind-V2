"""
User fact extraction from conversations.

Inspired by mem0 — extracts key facts about the user from conversation
messages, deduplicates against existing memory, and stores as USER_PROFILE
memory entries.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import Enum

from src.embedding.resolver import get_memory_embedding_provider
from src.infra.config import get_settings

logger = logging.getLogger(__name__)

# Deduplication thresholds
_SEMANTIC_SIMILARITY_THRESHOLD = 0.78
_ENTITY_OVERLAP_THRESHOLD = 0.50


class FactCategory(str, Enum):
    """Categories of extracted user facts."""

    PREFERENCE = "preference"
    CONTEXT = "context"
    DECISION = "decision"
    PROBLEM = "problem"
    SOLUTION = "solution"
    PERSONAL_INFO = "personal_info"


@dataclass
class ExtractedFact:
    """A fact extracted from a conversation."""

    content: str
    category: FactCategory
    confidence: float = 0.8
    entities: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)


_EXTRACTION_PROMPT = """Analyze the following conversation and extract key facts worth remembering.

Extract facts from BOTH the user's messages AND the assistant's responses.

Focus on:
- User preferences (tools, languages, frameworks, styles)
- Personal context (role, location, team, projects)
- Decisions made during the conversation (architecture, tech choices)
- Problems encountered and their root causes
- Solutions found, fixes applied, or workarounds discovered
- Technical knowledge shared by the assistant (configurations, patterns, explanations)
- Project-specific facts (stack, structure, conventions)
- Personal information shared voluntarily

Do NOT extract:
- Generic greetings or pleasantries
- Vague or hypothetical statements
- Facts already obvious from context (e.g., "the user is chatting with an AI")

Return a JSON array of facts. Each fact must have:
- "content": a concise, self-contained statement (1-2 sentences). Write it as a fact, not a quote.
- "category": one of "preference", "context", "decision", "problem", "solution", "personal_info"
- "confidence": float 0-1 (how confident this is a real, confirmed fact)
- "entities": list of key entity strings (names, tools, concepts mentioned)
- "tags": list of 2-5 lowercase topic tags describing what the fact is about (e.g. "python", "docker", "authentication", "performance", "database"). Tags must be short, concrete, and reusable across multiple facts. Do NOT use category names as tags.

Return ONLY the JSON array, no other text. If no facts found, return [].

Conversation:
{messages}"""


class FactExtractor:
    """Extracts user facts from conversations and stores them in memory."""

    def __init__(self) -> None:
        self._settings = get_settings()

    async def extract_facts(
        self,
        messages: list[dict],
        user_id: str,
        agent_id: str,
    ) -> list[ExtractedFact]:
        """Extract key facts from conversation messages via LLM."""
        if not messages:
            return []

        # Format messages for prompt
        formatted = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content.strip():
                formatted.append(f"{role}: {content}")

        if not formatted:
            return []

        conversation_text = "\n".join(formatted[-50:])  # Last 50 messages max
        prompt = _EXTRACTION_PROMPT.format(messages=conversation_text)

        # Call LLM
        try:
            from src.llm.provider_factory import LLMProviderFactory

            model_id = self._settings.FACT_EXTRACTION_MODEL
            if not model_id:
                # Resolve first available chat model from the default provider
                provider_name = self._settings.DEFAULT_LLM_PROVIDER
                provider = LLMProviderFactory.get_provider(provider_name)
                if provider:
                    available = await provider.list_models()
                    chat_models = [
                        m for m in available
                        if "embed" not in m.id.lower()
                        and "minilm" not in m.id.lower()
                    ]
                    if chat_models:
                        model_id = f"{provider_name}:{chat_models[0].id}"
                if not model_id:
                    logger.warning("No chat model available for fact extraction")
                    return []

            from src.infra.constants import parse_model_id
            provider_name, model_name = parse_model_id(model_id)

            provider = LLMProviderFactory.get_provider(provider_name)
            if not provider:
                logger.warning("No LLM provider available for fact extraction")
                return []

            llm = await provider.get_model(model_name, temperature=0.1)

            from langchain_core.messages import HumanMessage
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            raw_text = response.content.strip()

            # Parse JSON response
            if raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1]
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:]

            facts_data = json.loads(raw_text)
            if not isinstance(facts_data, list):
                return []

            facts = []
            for item in facts_data:
                try:
                    fact = ExtractedFact(
                        content=item["content"],
                        category=FactCategory(item.get("category", "context")),
                        confidence=float(item.get("confidence", 0.8)),
                        entities=item.get("entities", []),
                        tags=[str(t).lower().strip() for t in item.get("tags", []) if t],
                    )
                    facts.append(fact)
                except (KeyError, ValueError) as e:
                    logger.debug("Skipping malformed fact: %s", e)

            return facts

        except Exception as e:
            logger.error("Fact extraction failed: %s", e)
            return []

    async def deduplicate_and_store(
        self,
        facts: list[ExtractedFact],
        user_id: str,
    ) -> int:
        """Deduplicate facts against existing memory and store new ones.

        Returns count of new/updated facts.
        """
        if not facts:
            return 0

        from src.infra.database import async_session_maker

        from .models import MemoryScope, MemoryTier
        from .repository import MemoryRepository
        from .vector_store import QdrantMemoryVectorStore

        embedding_provider = get_memory_embedding_provider()
        vector_store = QdrantMemoryVectorStore()

        count = 0
        async with async_session_maker() as batch_db:
            batch_repo = MemoryRepository(batch_db)
            for fact in facts:
                try:
                    # Generate embedding for the fact
                    fact_embedding = await embedding_provider.embed_text(fact.content)

                    # Search existing user profile memories
                    existing = await vector_store.search(
                        query_embedding=fact_embedding,
                        query_text=fact.content,
                        user_id=user_id,
                        scope="user_profile",
                        limit=3,
                        threshold=0.0,
                    )

                    # Check for duplicates
                    is_duplicate = False
                    for result in existing:
                        # Tier 1: Category + entity overlap
                        existing_meta = result.metadata or {}
                        existing_category = existing_meta.get("category", "")
                        existing_entities = set(existing_meta.get("entities", []))
                        fact_entities = set(fact.entities)

                        if (
                            existing_category == fact.category.value
                            and fact_entities
                            and existing_entities
                        ):
                            overlap = len(fact_entities & existing_entities) / max(
                                len(fact_entities), 1
                            )
                            if overlap >= _ENTITY_OVERLAP_THRESHOLD:
                                merged_content = f"{result.content} | {fact.content}"
                                merged_entities = list(existing_entities | fact_entities)
                                merged_tags = list(
                                    set(existing_meta.get("tags", [])) | set(fact.tags)
                                )
                                await vector_store.upsert_entry(
                                    entry_id=result.point_id,
                                    embedding=fact_embedding,
                                    content=merged_content,
                                    scope="user_profile",
                                    scope_id=user_id,
                                    user_id=user_id,
                                    importance=max(result.importance, fact.confidence),
                                    metadata={
                                        "category": fact.category.value,
                                        "entities": merged_entities,
                                        "tags": merged_tags,
                                        "source": "fact_extraction",
                                    },
                                )
                                is_duplicate = True
                                count += 1
                                break

                        # Tier 2: Semantic similarity
                        if result.score >= _SEMANTIC_SIMILARITY_THRESHOLD:
                            merged_tags = list(
                                set(existing_meta.get("tags", [])) | set(fact.tags)
                            )
                            await vector_store.upsert_entry(
                                entry_id=result.point_id,
                                embedding=fact_embedding,
                                content=fact.content,
                                scope="user_profile",
                                scope_id=user_id,
                                user_id=user_id,
                                importance=max(result.importance, fact.confidence),
                                metadata={
                                    "category": fact.category.value,
                                    "entities": fact.entities,
                                    "tags": fact.tags,
                                    "source": "fact_extraction",
                                },
                            )
                            is_duplicate = True
                            count += 1
                            break

                    if not is_duplicate:
                        await batch_repo.create_entry(
                            scope=MemoryScope.USER_PROFILE,
                            scope_id=user_id,
                            content=fact.content,
                            embedding=fact_embedding,
                            tier=MemoryTier.VECTOR,
                            metadata={
                                "category": fact.category.value,
                                "entities": fact.entities,
                                "tags": fact.tags,
                                "source": "fact_extraction",
                            },
                            user_id=user_id,
                            importance=fact.confidence,
                        )
                        count += 1

                except Exception as e:
                    logger.error("Failed to process fact: %s", e)

            await batch_db.commit()

        return count

    async def extract_from_conversation(self, conversation_id: str) -> int:
        """Load conversation, extract facts, deduplicate and store.

        Returns total facts processed.
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
                logger.warning("Conversation %s not found for fact extraction", conversation_id)
                return 0

            # Load messages
            msg_result = await db.execute(
                select(ConversationMessage)
                .where(ConversationMessage.conversation_id == conversation_id)
                .order_by(ConversationMessage.created_at)
            )
            messages = msg_result.scalars().all()

            min_messages = self._settings.FACT_EXTRACTION_MIN_MESSAGES
            if len(messages) < min_messages:
                logger.debug(
                    "Conversation %s has %d messages (min %d), skipping extraction",
                    conversation_id, len(messages), min_messages,
                )
                return 0

            # Format messages
            msg_dicts = [
                {"role": m.role.value, "content": m.content}
                for m in messages
            ]

            user_id = conversation.user_id
            agent_id = conversation.agent_id or ""

        # Extract and store
        facts = await self.extract_facts(msg_dicts, user_id, agent_id)
        if not facts:
            return 0

        count = await self.deduplicate_and_store(facts, user_id)
        logger.info(
            "Extracted %d facts from conversation %s (%d raw)",
            count, conversation_id, len(facts),
        )
        return count
