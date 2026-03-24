"""Graph execution state definitions."""

import operator
from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph import add_messages


def _last_value(current: str | None, update: str | None) -> str | None:
    return update


def _merge_dicts(current: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
    return {**current, **update}


def _replace_list(
    current: list[dict[str, Any]], update: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return update


class GraphState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    input_prompt: str
    input_data: dict[str, Any]
    current_node: Annotated[str | None, _last_value]
    node_outputs: Annotated[dict[str, Any], _merge_dicts]
    should_interrupt: Annotated[bool, operator.or_]
    error: Annotated[str | None, _last_value]
    metadata: Annotated[dict[str, Any], _merge_dicts]
    branch_results: Annotated[list[dict[str, Any]], _replace_list]
    loop_state: Annotated[dict[str, Any], _merge_dicts]
    delegation_context: Annotated[dict[str, Any], _merge_dicts]
    approval_context: Annotated[dict[str, Any], _merge_dicts]


def create_initial_state(
    prompt: str,
    input_data: dict[str, Any] | None = None,
    messages: list[BaseMessage] | None = None,
) -> GraphState:
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
