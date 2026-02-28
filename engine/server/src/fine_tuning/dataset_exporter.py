"""
Dataset exporter.

Queries training data from execution feedback, runs, and conversations,
then exports as JSONL in OpenAI chat fine-tuning format.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import tiktoken
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.conversations.models import Conversation, ConversationMessage, MessageRole
from src.domain_config.provider import get_config_provider
from src.executions.feedback import ExecutionFeedback
from src.executions.models import ExecutionRun, ExecutionStatus
from src.infra.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class DatasetStats:
    """Statistics from a dataset export."""

    total: int = 0
    valid: int = 0
    invalid: int = 0
    warnings: list[str] = field(default_factory=list)
    token_stats: dict[str, int] = field(default_factory=dict)


class DatasetExporter:
    """Exports per-agent training data as JSONL."""

    def __init__(self, db: AsyncSession, agent_id: str):
        self.db = db
        self.agent_id = agent_id
        self._system_prompt: str | None = None
        self._encoding: tiktoken.Encoding | None = None

    async def _get_system_prompt(self) -> str:
        """Get agent's system_prompt via ConfigProvider."""
        if self._system_prompt is None:
            config = get_config_provider()
            agent = await config.get_agent_config(self.agent_id)
            if agent is None:
                raise ValueError(
                    f"Agent config not found for '{self.agent_id}'. "
                    "Cannot export dataset without a system prompt."
                )
            self._system_prompt = agent.system_prompt or ""
        return self._system_prompt

    def _get_encoding(self) -> tiktoken.Encoding:
        """Get tiktoken encoding (cached)."""
        if self._encoding is None:
            try:
                self._encoding = tiktoken.encoding_for_model("gpt-4o-mini")
            except KeyError:
                self._encoding = tiktoken.get_encoding("cl100k_base")
        return self._encoding

    def _count_tokens(self, text: str) -> int:
        """Count tokens in a string using tiktoken."""
        return len(self._get_encoding().encode(text))

    def _count_example_tokens(self, example: dict) -> int:
        """Count total tokens in a training example."""
        total = 0
        for msg in example.get("messages", []):
            total += self._count_tokens(msg.get("content", ""))
            total += 4  # role/name overhead per message
        total += 2  # assistant reply priming
        return total

    async def export_dataset(
        self, filters: dict[str, Any], output_path: str
    ) -> DatasetStats:
        """Main export method. Queries data, formats, validates, writes JSONL."""
        system_prompt = await self._get_system_prompt()
        stats = DatasetStats()
        seen_hashes: set[str] = set()
        all_examples: list[dict] = []

        # Gather examples from all sources (priority: feedback > executions > conversations)
        if filters.get("include_feedback", True):
            feedback_examples = await self._get_feedback_examples(filters)
            all_examples.extend(feedback_examples)

        if filters.get("include_executions", True):
            execution_examples = await self._get_execution_examples(filters)
            all_examples.extend(execution_examples)

        if filters.get("include_conversations", True):
            conversation_examples = await self._get_conversation_examples(filters)
            all_examples.extend(conversation_examples)

        # Format, deduplicate, validate, and write
        max_examples = filters.get("max_examples", 1000)
        max_tokens = settings.FINETUNING_MAX_TOKENS_PER_EXAMPLE
        valid_examples: list[dict] = []
        token_counts: list[int] = []

        for raw in all_examples:
            formatted = self._format_openai_chat(system_prompt, raw["messages"])
            content_hash = hashlib.sha256(
                json.dumps(formatted, sort_keys=True).encode()
            ).hexdigest()

            # Deduplicate
            if content_hash in seen_hashes:
                continue
            seen_hashes.add(content_hash)

            stats.total += 1

            # Validate
            is_valid, reasons = self._validate_example(formatted, max_tokens)
            if not is_valid:
                stats.invalid += 1
                continue

            token_count = self._count_example_tokens(formatted)
            token_counts.append(token_count)
            valid_examples.append(formatted)
            stats.valid += 1

            if len(valid_examples) >= max_examples:
                break

        # Warnings
        min_examples = settings.FINETUNING_MIN_EXAMPLES
        if stats.valid < min_examples:
            stats.warnings.append(
                f"Only {stats.valid} examples found, minimum recommended is {min_examples}"
            )

        # Token stats
        if token_counts:
            stats.token_stats = {
                "avg": sum(token_counts) // len(token_counts),
                "max": max(token_counts),
                "total": sum(token_counts),
            }

        # Write JSONL
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        with open(output, "w", encoding="utf-8") as f:
            for example in valid_examples:
                f.write(json.dumps(example, ensure_ascii=False) + "\n")

        logger.info(
            "Exported dataset: %d valid / %d total examples to %s",
            stats.valid,
            stats.total,
            output_path,
        )
        return stats

    async def _get_feedback_examples(
        self, filters: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Query ExecutionFeedback with corrections for this agent."""
        min_rating = filters.get("min_rating", 4)

        query = select(ExecutionFeedback).where(
            and_(
                ExecutionFeedback.agent_id.isnot(None),
                ExecutionFeedback.agent_id == self.agent_id,
                ExecutionFeedback.correction.isnot(None),
                ExecutionFeedback.rating >= min_rating,
            )
        )

        if filters.get("date_from"):
            query = query.where(ExecutionFeedback.created_at >= filters["date_from"])
        if filters.get("date_to"):
            query = query.where(ExecutionFeedback.created_at <= filters["date_to"])

        query = query.order_by(ExecutionFeedback.created_at.desc())
        result = await self.db.execute(query)
        feedbacks = result.scalars().all()

        examples = []
        for fb in feedbacks:
            # Use original_response as user input context, correction as assistant output
            messages = []
            if fb.original_response:
                messages.append({"role": "user", "content": fb.original_response})
            messages.append({"role": "assistant", "content": fb.correction})
            examples.append({"messages": messages, "source_type": "feedback", "source_id": fb.id})

        return examples

    async def _get_execution_examples(
        self, filters: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Query completed ExecutionRun for this agent."""
        query = select(ExecutionRun).where(
            and_(
                ExecutionRun.agent_id == self.agent_id,
                ExecutionRun.status == ExecutionStatus.COMPLETED,
            )
        )

        if filters.get("date_from"):
            query = query.where(ExecutionRun.created_at >= filters["date_from"])
        if filters.get("date_to"):
            query = query.where(ExecutionRun.created_at <= filters["date_to"])

        query = query.order_by(ExecutionRun.created_at.desc())
        result = await self.db.execute(query)
        runs = result.scalars().all()

        examples = []
        for run in runs:
            if not run.input_prompt or not run.output_data:
                continue
            # Extract assistant content from output_data
            output_content = run.output_data.get("content", "") if isinstance(run.output_data, dict) else str(run.output_data)
            if not output_content:
                continue

            messages = [
                {"role": "user", "content": run.input_prompt},
                {"role": "assistant", "content": output_content},
            ]
            examples.append({"messages": messages, "source_type": "execution", "source_id": run.id})

        return examples

    async def _get_conversation_examples(
        self, filters: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Query ConversationMessage grouped by conversation for this agent."""
        # Join through Conversation to filter by agent_id
        query = (
            select(ConversationMessage)
            .join(
                Conversation,
                ConversationMessage.conversation_id == Conversation.id,
            )
            .where(
                and_(
                    Conversation.agent_id.isnot(None),
                    Conversation.agent_id == self.agent_id,
                )
            )
            .order_by(
                ConversationMessage.conversation_id,
                ConversationMessage.created_at,
            )
        )

        if filters.get("date_from"):
            query = query.where(ConversationMessage.created_at >= filters["date_from"])
        if filters.get("date_to"):
            query = query.where(ConversationMessage.created_at <= filters["date_to"])

        result = await self.db.execute(query)
        messages_rows = result.scalars().all()

        # Group by conversation
        conversations: dict[str, list] = {}
        for msg in messages_rows:
            conv_id = msg.conversation_id
            if conv_id not in conversations:
                conversations[conv_id] = []
            # Skip system and tool messages (system prompt injected separately)
            if msg.role in (MessageRole.SYSTEM, MessageRole.TOOL):
                continue
            conversations[conv_id].append(
                {"role": msg.role.value, "content": msg.content or ""}
            )

        examples = []
        for conv_id, msgs in conversations.items():
            # Need at least one user and one assistant message
            has_user = any(m["role"] == "user" for m in msgs)
            has_assistant = any(m["role"] == "assistant" for m in msgs)
            if has_user and has_assistant:
                examples.append({"messages": msgs, "source_type": "conversation", "source_id": conv_id})

        return examples

    def _format_openai_chat(
        self, system_prompt: str, messages: list[dict[str, str]]
    ) -> dict:
        """Format as OpenAI chat fine-tuning example."""
        formatted_messages = []
        if system_prompt:
            formatted_messages.append({"role": "system", "content": system_prompt})
        formatted_messages.extend(messages)
        return {"messages": formatted_messages}

    def _validate_example(
        self, example: dict, max_tokens: int
    ) -> tuple[bool, list[str]]:
        """Validate a training example."""
        reasons: list[str] = []
        messages = example.get("messages", [])

        if not messages:
            reasons.append("No messages")
            return False, reasons

        roles = [m.get("role") for m in messages]

        if "user" not in roles:
            reasons.append("Missing user message")
        if "assistant" not in roles:
            reasons.append("Missing assistant message")

        # Check for empty content
        for msg in messages:
            if not msg.get("content", "").strip():
                reasons.append(f"Empty content in {msg.get('role', 'unknown')} message")

        if reasons:
            return False, reasons

        # Token count check
        token_count = self._count_example_tokens(example)
        if token_count > max_tokens:
            reasons.append(
                f"Token count {token_count} exceeds limit {max_tokens}"
            )
            return False, reasons

        return True, []

    def _compute_token_stats(self, examples: list[dict]) -> dict[str, int]:
        """Compute aggregate token statistics."""
        counts = [self._count_example_tokens(ex) for ex in examples]
        if not counts:
            return {"avg": 0, "max": 0, "total": 0}
        return {
            "avg": sum(counts) // len(counts),
            "max": max(counts),
            "total": sum(counts),
        }
