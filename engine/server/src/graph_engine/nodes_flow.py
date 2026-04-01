"""Node creators for flow-control node types: condition, parallel, merge, loop."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph

from ._utils import resolve_dot_path
from .condition_eval import build_condition_context, safe_eval_condition
from .state import GraphState

NodeFn = Callable[[GraphState], Awaitable[dict[str, Any]]]

logger = logging.getLogger(__name__)


def create_condition_node(node_id: str, node_data: dict[str, Any]) -> NodeFn:
    """Create a condition evaluation node."""

    async def condition_node(state: GraphState) -> dict:
        logger.info("Evaluating condition node: %s", node_id)
        return {"current_node": node_id}

    return condition_node


def create_parallel_node(
    node_id: str,
    node_data: dict[str, Any],
    branch_node_ids: list[str],
    compiled_node_funcs: dict[str, NodeFn],
) -> NodeFn:
    """Create a parallel node that executes branches via asyncio.gather."""
    branch_ids = branch_node_ids or []

    async def parallel_node(state: GraphState, config: RunnableConfig) -> dict:
        logger.info("Parallel %s: executing %d branches", node_id, len(branch_ids))

        async def run_branch(bid: str) -> dict[str, Any]:
            func = compiled_node_funcs.get(bid)
            if not func:
                return {"branch_id": bid, "error": f"Branch node '{bid}' not found"}
            try:
                result = await func(state, config)
                return {
                    "branch_id": bid,
                    "output": result.get("node_outputs", {}).get(bid, {}),
                    "messages": result.get("messages", []),
                }
            except Exception as e:
                logger.error("Branch %s failed: %s", bid, e)
                return {"branch_id": bid, "error": str(e)}

        results = await asyncio.gather(*[run_branch(bid) for bid in branch_ids])

        return {
            "current_node": node_id,
            "branch_results": list(results),
            "node_outputs": {
                **state.get("node_outputs", {}),
                node_id: {"branches": len(results)},
            },
        }

    return parallel_node


def create_merge_node(node_id: str, node_data: dict[str, Any]) -> NodeFn:
    """Create a merge node that aggregates parallel branch results.

    Strategies:
    - combine_outputs (default): merge all branch outputs into one dict
    - concat_messages: append all branch messages to state
    - first_non_empty: take first successful branch output
    - all: keep all branch results as-is
    """
    strategy = node_data.get("config", {}).get("merge_strategy", "combine_outputs")

    async def merge_node(state: GraphState, config: RunnableConfig) -> dict:
        branch_results = state.get("branch_results", [])
        logger.info(
            "Merge %s: %d branches, strategy=%s", node_id, len(branch_results), strategy
        )

        merged_outputs: dict[str, Any] = {}
        merged_messages: list = []

        for br in branch_results:
            if br.get("error"):
                merged_outputs[br["branch_id"]] = {"error": br["error"]}
            else:
                merged_outputs[br["branch_id"]] = br.get("output", {})
                merged_messages.extend(br.get("messages", []))

        if strategy == "concat_messages":
            return {
                "current_node": node_id,
                "messages": merged_messages,
                "node_outputs": {node_id: {"merged": len(branch_results)}},
                "branch_results": [],
            }

        elif strategy == "first_non_empty":
            for br in branch_results:
                output = br.get("output", {})
                if output and not br.get("error"):
                    return {
                        "current_node": node_id,
                        "node_outputs": {
                            **state.get("node_outputs", {}),
                            node_id: output,
                        },
                        "branch_results": [],
                    }
            return {"current_node": node_id, "branch_results": []}

        elif strategy == "all":
            return {
                "current_node": node_id,
                "node_outputs": {node_id: {"branches": branch_results}},
                "branch_results": [],
            }

        else:  # combine_outputs (default)
            combined: dict[str, Any] = {}
            for _bid, output in merged_outputs.items():
                if isinstance(output, dict) and "error" not in output:
                    combined.update(output)
            return {
                "current_node": node_id,
                "node_outputs": {node_id: combined},
                "branch_results": [],
            }

    return merge_node


def create_loop_node(
    node_id: str,
    node_data: dict[str, Any],
    compiled_node_funcs: dict[str, NodeFn],
) -> NodeFn:
    """Create a loop node for iterating over collections.

    Modes:
    - batch: call target once with full collection
    - item: call target per-item with asyncio.Semaphore concurrency control
    """
    config = node_data.get("config", {})
    source_path = config.get("source", "")
    mode = config.get("mode", "batch")
    max_concurrency = config.get("max_concurrency", 5)
    item_var = config.get("item_variable", "current_item")
    target_node_id = config.get("target_node")

    async def loop_node(state: GraphState, runnable_config: RunnableConfig) -> dict:
        collection = resolve_dot_path(state, source_path)
        if collection is None:
            collection = []
        if not isinstance(collection, list):
            collection = list(collection) if hasattr(collection, "__iter__") else [collection]

        logger.info(
            "Loop %s: %d items, mode=%s, target=%s",
            node_id,
            len(collection),
            mode,
            target_node_id,
        )

        target_func = compiled_node_funcs.get(target_node_id or "")
        if not target_func:
            raise ValueError(f"Loop target '{target_node_id}' not found in compiled functions")

        if mode == "batch":
            batch_state = {
                **state,
                "input_data": {**state.get("input_data", {}), "items": collection},
            }
            result = await target_func(batch_state, runnable_config)
            results = [result]
        else:  # item mode
            sem = asyncio.Semaphore(max_concurrency)

            async def process_item(idx: int, item: Any) -> Any:
                async with sem:
                    item_state = {
                        **state,
                        "input_data": {
                            **state.get("input_data", {}),
                            item_var: item,
                            "loop_index": idx,
                        },
                    }
                    return await target_func(item_state, runnable_config)

            results = await asyncio.gather(
                *[process_item(i, item) for i, item in enumerate(collection)],
                return_exceptions=True,
            )

        processed = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                processed.append({"index": i, "error": str(r)})
            elif isinstance(r, dict):
                node_output = r.get("node_outputs", {}).get(target_node_id, r)
                processed.append({"index": i, **node_output})
            else:
                processed.append({"index": i, "output": r})

        return {
            "current_node": node_id,
            "node_outputs": {
                **state.get("node_outputs", {}),
                node_id: {"results": processed, "total": len(collection)},
            },
            "loop_state": {
                "items": collection,
                "results": processed,
                "mode": mode,
                "node_id": node_id,
            },
        }

    return loop_node


def add_conditional_edges(
    workflow: StateGraph,
    node_id: str,
    outgoing_edges: list,
    nodes_by_id: dict,
) -> None:
    """Add conditional edges with AST-based expression evaluation."""
    condition_map: list[tuple[str, str]] = []
    default_target = END

    for edge in outgoing_edges:
        target = edge.target
        edge_data = edge.data or {}
        condition = edge_data.get("condition")

        target_node = nodes_by_id.get(target)
        actual_target = END if target_node and target_node.type == "end" else target

        if condition and condition.lower() not in ("default", "else"):
            condition_map.append((condition, actual_target))
        else:
            default_target = actual_target

    def route_condition(state: GraphState) -> str:
        ctx = build_condition_context(state)
        for expr, target in condition_map:
            if safe_eval_condition(expr, ctx):
                return target
        return default_target

    all_targets = list(set(t for _, t in condition_map) | {default_target})
    workflow.add_conditional_edges(node_id, route_condition, all_targets)
