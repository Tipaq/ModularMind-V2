"""Graph execution state definitions."""

from typing import Any, TypedDict

from langchain_core.messages import BaseMessage


class GraphState(TypedDict, total=False):
    """State passed through graph nodes during execution.

    This TypedDict defines the shape of state that flows through
    the LangGraph execution. All fields are optional to allow
    incremental state building.

    Attributes:
        messages: Conversation message history
        input_prompt: Original user prompt
        input_data: Additional input context/data
        current_node: ID of currently executing node
        node_outputs: Mapping of node_id -> output data
        should_interrupt: Flag to pause execution
        error: Error message if execution failed
        metadata: Additional execution metadata
        branch_results: Results from parallel branch execution
        loop_state: Current loop iteration state
        delegation_context: Supervisor delegation tracking
        approval_context: HITL approval tracking (node_id, status, approved_by, notes)
    """

    messages: list[BaseMessage]
    input_prompt: str
    input_data: dict[str, Any]
    current_node: str | None
    node_outputs: dict[str, Any]
    should_interrupt: bool
    error: str | None
    metadata: dict[str, Any]
    branch_results: list[dict[str, Any]]
    loop_state: dict[str, Any]
    delegation_context: dict[str, Any]
    approval_context: dict[str, Any]


def create_initial_state(
    prompt: str,
    input_data: dict[str, Any] | None = None,
    messages: list[BaseMessage] | None = None,
) -> GraphState:
    """Create initial graph state for execution.

    Args:
        prompt: The user's input prompt
        input_data: Optional additional context data
        messages: Optional existing message history

    Returns:
        Initialized GraphState ready for execution
    """
    return GraphState(
        messages=messages or [],
        input_prompt=prompt,
        input_data=input_data or {},
        current_node=None,
        node_outputs={},
        should_interrupt=False,
        error=None,
        metadata={},
        branch_results=[],
        loop_state={},
        delegation_context={},
        approval_context={},
    )
