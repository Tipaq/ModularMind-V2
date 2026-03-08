"""User profile auto-synthesis service.

Periodically reads recent conversations and merges user facts into the
user's profile text using an LLM. Called by the scheduler cron job.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.conversations.models import Conversation, ConversationMessage
from src.infra.config import get_settings
from src.infra.utils import utcnow

logger = logging.getLogger(__name__)

SYNTHESIS_PROMPT = """\
You are a user profile synthesizer. Given the user's current profile and recent \
conversation excerpts, produce an updated profile that incorporates any new \
preferences, facts, or instructions the user expressed.

Rules:
- Keep the profile concise (max 2000 characters).
- Preserve all existing preferences unless explicitly contradicted.
- Add new facts/preferences discovered in the conversations.
- Use bullet points or short paragraphs.
- Do NOT include conversation content verbatim — summarize into preference statements.
- Output ONLY the updated profile text, nothing else.

Current profile:
{current_profile}

Recent conversation excerpts:
{conversation_excerpts}

Updated profile:"""


class ProfileSynthesizer:
    """Synthesizes user profile from recent conversations."""

    async def synthesize(self, user_id: str, db: AsyncSession) -> str | None:
        """Run synthesis for a single user.

        Returns the new profile text, or None if no update was needed/possible.
        """
        settings = get_settings()

        # Load user
        user = await db.get(User, user_id)
        if not user:
            return None

        current_profile = user.preferences or ""

        # Find conversations newer than last synthesis
        since = user.last_profile_synthesis_at
        conv_query = (
            select(Conversation.id)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
        )
        if since:
            conv_query = conv_query.where(Conversation.updated_at > since)

        conv_result = await db.execute(conv_query.limit(20))
        conv_ids = [row[0] for row in conv_result.all()]

        if not conv_ids:
            return None  # No new conversations

        # Load last 50 messages from those conversations
        msg_result = await db.execute(
            select(ConversationMessage.role, ConversationMessage.content)
            .where(ConversationMessage.conversation_id.in_(conv_ids))
            .order_by(ConversationMessage.created_at.desc())
            .limit(50)
        )
        messages = list(msg_result.all())
        if not messages:
            return None

        messages.reverse()  # chronological
        excerpts = "\n".join(
            f"{role.value if hasattr(role, 'value') else role}: {(content or '')[:300]}"
            for role, content in messages
        )

        # Call LLM
        prompt = SYNTHESIS_PROMPT.format(
            current_profile=current_profile or "(empty — first synthesis)",
            conversation_excerpts=excerpts,
        )

        try:
            new_profile = await self._call_llm(prompt, settings)
        except Exception as e:
            logger.warning("Profile synthesis LLM call failed for user %s: %s", user_id, e)
            return None

        # Validate LLM output
        if not self._validate_output(new_profile):
            logger.warning(
                "Profile synthesis output rejected for user %s (len=%d)",
                user_id,
                len(new_profile) if new_profile else 0,
            )
            return None

        # Update user
        user.preferences = new_profile
        user.last_profile_synthesis_at = utcnow()
        await db.flush()

        logger.info("Profile synthesized for user %s (%d chars)", user_id, len(new_profile))
        return new_profile

    @staticmethod
    def _validate_output(text: str | None) -> bool:
        """Validate LLM output is usable as a profile."""
        if not text or not text.strip():
            return False
        if len(text) > 2000:
            return False
        # Refusal detection
        lower = text.strip().lower()
        refusal_prefixes = ("i cannot", "i'm sorry", "i am sorry", "i can't", "as an ai")
        return not any(lower.startswith(prefix) for prefix in refusal_prefixes)

    @staticmethod
    async def _call_llm(prompt: str, settings) -> str:
        """Call an LLM for synthesis. Uses the configured synthesis model."""
        from src.llm.provider import get_llm_provider

        model_id = settings.PROFILE_SYNTHESIS_MODEL
        if not model_id:
            # Fallback: use first available model from config
            try:
                from src.agents.config_provider import ConfigProvider

                provider = ConfigProvider()
                models = await provider.list_models()
                if models:
                    model_id = models[0].get("model_id", "")
            except Exception:
                pass

        if not model_id:
            raise ValueError("No model available for profile synthesis")

        # Parse provider:model format
        if ":" in model_id:
            prefix, model_name = model_id.split(":", 1)
            known_providers = {"openai", "anthropic", "ollama"}
            provider_name = prefix.lower() if prefix.lower() in known_providers else "ollama"
        else:
            provider_name = "ollama"

        provider_kwargs = {}
        if provider_name == "ollama":
            provider_kwargs["base_url"] = settings.OLLAMA_BASE_URL

        llm_provider = get_llm_provider(provider_name, **provider_kwargs)
        llm = await llm_provider.get_model(model_id)

        from langchain_core.messages import HumanMessage

        response = await llm.ainvoke([HumanMessage(content=prompt)])
        return response.content if isinstance(response.content, str) else str(response.content)
