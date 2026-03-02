"""
Memory Scorer.

Evaluates extracted facts using an LLM to assign refined importance scores
and classify memory types (episodic/semantic/procedural).
"""

import json
import logging
from dataclasses import dataclass

from langchain_core.messages import HumanMessage

from src.infra.config import get_settings
from src.infra.constants import parse_model_id
from src.llm.provider_factory import LLMProviderFactory

logger = logging.getLogger(__name__)

_SCORER_PROMPT = """You are a memory importance evaluator. Analyze each fact and assign:

1. **importance** (0.0 to 1.0): How important is this fact for long-term recall?
   - 0.0-0.2: Trivial, transient (e.g., "user said hello")
   - 0.3-0.5: Mildly useful context
   - 0.6-0.8: Important knowledge worth preserving
   - 0.9-1.0: Critical, core knowledge

2. **memory_type**: Classify as one of:
   - "episodic": Specific events, dated occurrences, one-time conversations
   - "semantic": General knowledge, preferences, facts, skills
   - "procedural": How-to knowledge, workflows, step-by-step procedures

3. **salience** (0.0 to 1.0): How inherently important is this fact regardless of context?

Respond with a JSON array matching the input order:
```json
[
  {{"importance": 0.7, "memory_type": "semantic", "salience": 0.6}},
  ...
]
```

Facts to evaluate:
{facts_text}
"""


@dataclass
class ScoredFact:
    """A fact with scorer-assigned importance and type."""

    text: str
    category: str
    importance: float
    scored_importance: float
    memory_type: str
    salience: float
    entities: list[str]


class MemoryScorer:
    """Scores extracted facts using LLM for importance and type classification."""

    def __init__(self) -> None:
        self._settings = get_settings()

    async def score_facts(self, facts: list[dict]) -> list[ScoredFact]:
        """Score a list of extracted facts using LLM.

        Args:
            facts: List of dicts with text, category, importance, entities.

        Returns:
            List of ScoredFact with refined importance and memory_type.
        """
        if not facts:
            return []

        # Build facts text for prompt
        facts_text = "\n".join(
            f"{i+1}. [{f.get('category', 'context')}] {f.get('text', '')}"
            for i, f in enumerate(facts)
        )

        prompt = _SCORER_PROMPT.format(facts_text=facts_text)

        try:
            scores = await self._call_llm(prompt)
        except Exception:
            logger.exception("Scorer LLM call failed, passing facts through unscored")
            # Fallback: return facts with original importance and default type
            return [
                ScoredFact(
                    text=f.get("text", ""),
                    category=f.get("category", "context"),
                    importance=float(f.get("importance", 0.5)),
                    scored_importance=float(f.get("importance", 0.5)),
                    memory_type="episodic",
                    salience=float(f.get("importance", 0.5)),
                    entities=f.get("entities", []),
                )
                for f in facts
            ]

        # Merge scores with original facts
        min_importance = self._settings.MEMORY_SCORER_MIN_IMPORTANCE
        result: list[ScoredFact] = []

        for i, fact in enumerate(facts):
            if i < len(scores):
                score_data = scores[i]
                scored_importance = float(score_data.get("importance", 0.5))
                memory_type = score_data.get("memory_type", "episodic")
                salience = float(score_data.get("salience", 0.5))
            else:
                scored_importance = float(fact.get("importance", 0.5))
                memory_type = "episodic"
                salience = scored_importance

            # Validate memory_type
            if memory_type not in ("episodic", "semantic", "procedural"):
                memory_type = "episodic"

            # Filter low-importance facts
            if scored_importance < min_importance:
                continue

            result.append(
                ScoredFact(
                    text=fact.get("text", ""),
                    category=fact.get("category", "context"),
                    importance=float(fact.get("importance", 0.5)),
                    scored_importance=scored_importance,
                    memory_type=memory_type,
                    salience=salience,
                    entities=fact.get("entities", []),
                )
            )

        return result

    async def _call_llm(self, prompt: str) -> list[dict]:
        """Call the scorer LLM and parse JSON response."""
        model_id = self._settings.MEMORY_SCORER_MODEL
        if not model_id:
            model_id = self._settings.FACT_EXTRACTION_MODEL
        if not model_id:
            # Resolve first available chat model
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
                raise ValueError("No chat model available for scoring")

        provider_name, model_name = parse_model_id(model_id)
        provider = LLMProviderFactory.get_provider(provider_name)
        llm = await provider.get_model(model_name, temperature=0.1)

        response = await llm.ainvoke([HumanMessage(content=prompt)])
        raw_text = response.content.strip()

        # Strip markdown code blocks if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]

        scores = json.loads(raw_text)
        if not isinstance(scores, list):
            raise ValueError(f"Expected JSON array, got {type(scores)}")

        return scores
