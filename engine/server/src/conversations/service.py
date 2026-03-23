"""
Conversation service.

Business logic for conversation management and message handling.
"""

import logging
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.infra.query_utils import escape_like
from src.infra.utils import utcnow

from .models import Conversation, ConversationMessage, MessageRole

logger = logging.getLogger(__name__)


def _message_count_subquery():
    return (
        select(
            ConversationMessage.conversation_id,
            func.count(ConversationMessage.id).label("msg_count"),
        )
        .group_by(ConversationMessage.conversation_id)
        .subquery()
    )


class ConversationService:
    """Service for managing conversations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_conversation(
        self,
        user_id: str,
        agent_id: str | None = None,
        graph_id: str | None = None,
        title: str | None = None,
        supervisor_mode: bool = False,
        config: dict | None = None,
    ) -> Conversation:
        """Create a new conversation."""
        conversation = Conversation(
            id=str(uuid4()),
            agent_id=agent_id,
            graph_id=graph_id,
            user_id=user_id,
            title=title,
            supervisor_mode=supervisor_mode,
            config=config or {},
        )
        self.db.add(conversation)
        await self.db.flush()
        return conversation

    async def list_conversations(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
        agent_id: str | None = None,
        project_id: str | None = None,
    ) -> tuple[list[tuple[Conversation, int]], int]:
        """List conversations for a user with message counts in a single query."""
        msg_count_sq = _message_count_subquery()

        # Base filter
        base_filter = [Conversation.user_id == user_id]
        if agent_id:
            base_filter.append(Conversation.agent_id == agent_id)
        if project_id:
            base_filter.append(Conversation.project_id == project_id)

        # Count total
        count_query = select(func.count(Conversation.id)).where(*base_filter)
        total = (await self.db.execute(count_query)).scalar() or 0

        # Main query with LEFT JOIN for message counts
        offset = (page - 1) * page_size
        query = (
            select(
                Conversation,
                func.coalesce(msg_count_sq.c.msg_count, 0).label("message_count"),
            )
            .outerjoin(msg_count_sq, Conversation.id == msg_count_sq.c.conversation_id)
            .where(*base_filter)
            .order_by(Conversation.updated_at.desc())
            .offset(offset)
            .limit(page_size)
        )

        result = await self.db.execute(query)
        rows = result.all()

        return [(row[0], row[1]) for row in rows], total

    async def list_all_conversations(
        self,
        page: int = 1,
        page_size: int = 20,
        agent_id: str | None = None,
        search: str | None = None,
    ) -> tuple[list[tuple[Conversation, int]], int]:
        """List ALL conversations (admin moderation view) with message counts."""
        from src.auth.models import User

        msg_count_sq = _message_count_subquery()

        base_filter: list = []
        if agent_id:
            base_filter.append(Conversation.agent_id == agent_id)
        if search:
            escaped = escape_like(search)
            base_filter.append(User.email.ilike(f"%{escaped}%", escape="\\"))

        needs_user_join = bool(search)

        count_base = select(func.count(Conversation.id))
        if needs_user_join:
            count_base = count_base.join(User, Conversation.user_id == User.id)
        if base_filter:
            count_base = count_base.where(*base_filter)
        total = (await self.db.execute(count_base)).scalar() or 0

        offset = (page - 1) * page_size
        query = select(
            Conversation,
            func.coalesce(msg_count_sq.c.msg_count, 0).label("message_count"),
        ).outerjoin(msg_count_sq, Conversation.id == msg_count_sq.c.conversation_id)
        if needs_user_join:
            query = query.join(User, Conversation.user_id == User.id)
        if base_filter:
            query = query.where(*base_filter)
        query = query.order_by(Conversation.updated_at.desc()).offset(offset).limit(page_size)

        result = await self.db.execute(query)
        rows = result.all()
        return [(row[0], row[1]) for row in rows], total

    async def get_conversation(self, conversation_id: str) -> Conversation | None:
        """Get a conversation with its messages (detail endpoint only)."""
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(selectinload(Conversation.messages))
        )
        return result.scalar_one_or_none()

    async def get_conversation_by_id(self, conversation_id: str) -> Conversation | None:
        """Get a conversation without loading messages."""
        result = await self.db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        return result.scalar_one_or_none()

    async def get_message_count(self, conversation_id: str) -> int:
        """Get the number of messages in a conversation."""
        result = await self.db.execute(
            select(func.count(ConversationMessage.id)).where(
                ConversationMessage.conversation_id == conversation_id
            )
        )
        return result.scalar() or 0

    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation and its related execution runs."""
        from sqlalchemy import delete

        from src.executions.models import ExecutionRun, ExecutionStep

        conversation = await self.get_conversation_by_id(conversation_id)
        if not conversation:
            return False

        # Delete messages first (they have FK to execution_runs)
        await self.db.execute(
            delete(ConversationMessage).where(
                ConversationMessage.conversation_id == conversation_id
            )
        )

        # Delete execution steps for runs linked to this conversation
        step_subq = (
            select(ExecutionRun.id)
            .where(ExecutionRun.session_id == conversation_id)
            .scalar_subquery()
        )
        await self.db.execute(delete(ExecutionStep).where(ExecutionStep.run_id.in_(step_subq)))

        # Delete execution runs linked to this conversation
        await self.db.execute(
            delete(ExecutionRun).where(ExecutionRun.session_id == conversation_id)
        )

        await self.db.delete(conversation)
        await self.db.flush()
        return True

    async def delete_messages_from(
        self,
        conversation_id: str,
        message_id: str,
    ) -> int:
        """Delete a message and all messages after it in the conversation."""
        msg = await self.db.get(ConversationMessage, message_id)
        if not msg or msg.conversation_id != conversation_id:
            return 0

        result = await self.db.execute(
            delete(ConversationMessage).where(
                ConversationMessage.conversation_id == conversation_id,
                ConversationMessage.created_at >= msg.created_at,
            )
        )
        await self.db.flush()
        return result.rowcount

    async def update_conversation(
        self,
        conversation_id: str,
        title: str | None = None,
        config: dict | None = None,
        supervisor_mode: bool | None = None,
    ) -> Conversation | None:
        """Update conversation title, config, and/or supervisor_mode."""
        from sqlalchemy import update

        values: dict = {}
        if title is not None:
            values["title"] = title
        if config is not None:
            values["config"] = config
        if supervisor_mode is not None:
            values["supervisor_mode"] = supervisor_mode
        if not values:
            return await self.get_conversation_by_id(conversation_id)

        await self.db.execute(
            update(Conversation).where(Conversation.id == conversation_id).values(**values)
        )
        await self.db.flush()
        return await self.get_conversation_by_id(conversation_id)

    async def add_message(
        self,
        conversation_id: str,
        role: MessageRole,
        content: str,
        metadata: dict | None = None,
        execution_id: str | None = None,
        attachments: list[dict] | None = None,
    ) -> ConversationMessage:
        """Add a message to a conversation."""
        message = ConversationMessage(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            meta=metadata or {},
            execution_id=execution_id,
            attachments=attachments or [],
        )
        self.db.add(message)

        # Update conversation timestamp
        from sqlalchemy import update

        await self.db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(updated_at=utcnow())
        )

        await self.db.flush()
        return message
