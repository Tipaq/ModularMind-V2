"""
Prompt Composer — composable multi-layer prompt builder.

Replaces monolithic SystemMessage(content=system_prompt) with ordered
layers: IDENTITY → PERSONALITY → TASK → CONTEXT. Each layer becomes
a separate SystemMessage, enabling LLM prompt caching, separation of
concerns, and per-conversation overrides.
"""

from dataclasses import dataclass
from enum import IntEnum

from langchain_core.messages import SystemMessage


class LayerType(IntEnum):
    """Layer types ordered by stability (most stable first).

    IDENTITY: Who the entity is — never changes per conversation.
    PERSONALITY: Communication style — rarely changes, overridable.
    TASK: What the entity should do — varies by strategy/invocation.
    CONTEXT: Dynamic information — changes every request.
    """

    IDENTITY = 0
    PERSONALITY = 1
    TASK = 2
    CONTEXT = 3


@dataclass
class PromptLayer:
    """A single prompt layer with type, content, and optional label."""

    layer_type: LayerType
    content: str
    label: str = ""


class PromptComposer:
    """Builds an ordered list[SystemMessage] from PromptLayers.

    Usage::

        composer = PromptComposer()
        composer.add(PromptLayer(LayerType.IDENTITY, identity_text))
        composer.add(PromptLayer(LayerType.TASK, task_text))
        composer.add_if(has_context, PromptLayer(LayerType.CONTEXT, ctx))
        messages = composer.build() + [HumanMessage(content=user_input)]
    """

    def __init__(self) -> None:
        self._layers: list[PromptLayer] = []

    def add(self, layer: PromptLayer) -> "PromptComposer":
        """Add a layer unconditionally."""
        self._layers.append(layer)
        return self

    def add_if(self, condition: bool, layer: PromptLayer) -> "PromptComposer":
        """Add a layer only when *condition* is truthy and content non-empty."""
        if condition and layer.content and layer.content.strip():
            self._layers.append(layer)
        return self

    def build(self) -> list[SystemMessage]:
        """Build sorted SystemMessage list.

        Layers are sorted by :class:`LayerType` ordinal (IDENTITY first,
        CONTEXT last).  Empty layers are silently dropped.
        """
        sorted_layers = sorted(self._layers, key=lambda layer: layer.layer_type.value)
        return [
            SystemMessage(content=layer.content)
            for layer in sorted_layers
            if layer.content and layer.content.strip()
        ]
