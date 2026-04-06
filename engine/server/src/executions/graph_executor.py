"""
Graph executor.

Handles inline graph execution with node streaming, trace events,
and real-time event delivery.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from langchain_core.messages import HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config import ConfigProvider
from src.graph_engine import GraphCompiler, create_initial_state
from src.infra.config import get_settings
from src.infra.constants import OUTPUT_TRUNCATION_LENGTH, SSE_CONTENT_LENGTH
from src.infra.utils import utcnow
from src.llm import get_llm_provider
from src.mcp.service import get_mcp_registry

from .creation import inject_project_metadata
from .models import ExecutionRun, ExecutionStatus, ExecutionStep

logger = logging.getLogger(__name__)
settings = get_settings()


async def execute_graph(
    db: AsyncSession,
    config_provider: ConfigProvider,
    execution: ExecutionRun,
) -> AsyncIterator[dict[str, Any]]:
    """Execute a graph (inline mode)."""
    graph_config = await config_provider.get_graph_config(execution.graph_id)
    if not graph_config:
        raise ValueError(f"Graph not found: {execution.graph_id}")

    # Get LLM provider with dynamic routing based on model_id prefix
    from src.llm import RoutingLLMProvider

    base_provider = get_llm_provider("ollama", base_url=settings.OLLAMA_BASE_URL)
    llm_provider = RoutingLLMProvider(base_provider)

    # Create compiler and compile graph
    compiler = GraphCompiler(
        config_provider, llm_provider, mcp_registry=get_mcp_registry()
    )
    graph = await compiler.compile_graph(graph_config)

    # Create initial state (user_id + project_id in metadata for tool scoping)
    state = create_initial_state(
        prompt=execution.input_prompt,
        input_data=execution.input_data,
        messages=[HumanMessage(content=execution.input_prompt)],
    )
    state["metadata"]["user_id"] = execution.user_id
    await inject_project_metadata(db, execution.session_id, state)

    # Set up trace handler — events go into a merged queue for real-time streaming
    from src.graph_engine.callbacks import ExecutionTraceHandler

    merged_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def _enqueue_trace(event: dict[str, Any]) -> None:
        merged_queue.put_nowait(event)

    trace_handler = ExecutionTraceHandler(
        execution_id=execution.id,
        publish_fn=_enqueue_trace,
    )

    # Emit graph start event
    yield {
        "type": "trace:graph_start",
        "graph_id": graph_config.id,
        "graph_name": graph_config.name,
        "node_count": len(graph_config.nodes),
        "edge_count": len(graph_config.edges),
    }

    # Build node info map for agent name resolution + model lookup
    node_info: dict[str, dict[str, Any]] = {}
    for n in graph_config.nodes:
        agent_id = (
            n.data.get("agent_id")
            or n.data.get("config", {}).get("agentId")
            or n.data.get("config", {}).get("agent_id")
        )
        agent_cfg = await config_provider.get_agent_config(agent_id) if agent_id else None
        node_info[n.id] = {
            "label": n.data.get("label", n.id),
            "type": n.type,
            "agent_id": agent_id,
            "model_id": agent_cfg.model_id if agent_cfg else None,
        }

    # Notifier: called by agent_node at the START of execution (before LLM call)
    def _node_started(nid: str, model: str | None) -> None:
        info = node_info.get(nid)
        if info and info["type"] not in ("start", "end"):
            merged_queue.put_nowait(
                {
                    "_type": "step_started",
                    "node_id": nid,
                    "agent_name": info.get("label", nid),
                    "model": model or info.get("model_id"),
                }
            )

    config = {
        "configurable": {
            "thread_id": execution.id,
            "_node_started_fn": _node_started,
        },
        "callbacks": [trace_handler],
    }

    # Run astream in a background task so trace events arrive in real-time
    step_number = 0
    stream_error: Exception | None = None

    async def _run_stream() -> None:
        nonlocal step_number, stream_error
        try:
            async for event in graph.astream(state, config, stream_mode="updates"):
                step_number += 1
                for nid, output in event.items():
                    if nid.startswith("__"):
                        continue
                    info = node_info.get(nid)
                    if not info or info["type"] in ("start", "end"):
                        continue
                    merged_queue.put_nowait(
                        {
                            "_type": "node_completed",
                            "node_id": nid,
                            "output": output,
                            "step_number": step_number,
                        }
                    )
        except Exception as e:
            stream_error = e
        finally:
            merged_queue.put_nowait({"_type": "stream_done"})

    stream_task = asyncio.create_task(_run_stream())

    # Consume merged queue — yields events in real-time
    while True:
        event = await merged_queue.get()

        internal_type = event.get("_type")

        if internal_type == "stream_done":
            break

        # Agent node started (from _node_started_fn callback)
        if internal_type == "step_started":
            yield {
                "type": "step",
                "event": "step_started",
                "agent_name": event["agent_name"],
                "node_id": event["node_id"],
                "model": event.get("model"),
            }
            continue

        # Agent node completed (from astream)
        if internal_type == "node_completed":
            nid = event["node_id"]
            output = event["output"]
            info = node_info[nid]
            node_label = info.get("label", nid)
            node_type = info.get("type", "node")

            # Extract input prompt and agent response
            input_prompt = None
            agent_response = None
            if isinstance(output, dict):
                msgs = output.get("messages", [])
                for m in reversed(msgs):
                    if hasattr(m, "type") and m.type == "human" and hasattr(m, "content"):
                        input_prompt = str(m.content)[:SSE_CONTENT_LENGTH]
                        break
                for m in reversed(msgs):
                    if hasattr(m, "type") and m.type == "ai" and hasattr(m, "content"):
                        agent_response = str(m.content)[:SSE_CONTENT_LENGTH]
                        break
                if not agent_response:
                    node_outputs = output.get("node_outputs", {})
                    for v in node_outputs.values():
                        if isinstance(v, dict) and "response" in v:
                            agent_response = str(v["response"])[:SSE_CONTENT_LENGTH]
                            break

            # Serialize output for DB
            safe_output: dict[str, Any] = {}
            if isinstance(output, dict):
                for k, v in output.items():
                    if k == "messages":
                        safe_output[k] = (
                            [
                                {
                                    "role": getattr(m, "type", "unknown"),
                                    "content": str(getattr(m, "content", m)),
                                }
                                if hasattr(m, "content")
                                else str(m)
                                for m in v
                            ]
                            if isinstance(v, list)
                            else str(v)
                        )
                    else:
                        try:
                            json.dumps(v)
                            safe_output[k] = v
                        except (TypeError, ValueError):
                            safe_output[k] = str(v)[:OUTPUT_TRUNCATION_LENGTH]
            else:
                safe_output = {"value": str(output)[:OUTPUT_TRUNCATION_LENGTH]}

            step = ExecutionStep(
                id=str(uuid4()),
                run_id=execution.id,
                step_number=event["step_number"],
                node_id=nid,
                node_type=node_type,
                status=ExecutionStatus.COMPLETED,
                output_data=safe_output,
                started_at=utcnow(),
                completed_at=utcnow(),
            )
            db.add(step)

            yield {
                "type": "step",
                "event": "step_completed",
                "agent_name": node_label,
                "node_id": nid,
                "agent_response": agent_response,
                "input_prompt": input_prompt,
            }
            continue

        # Trace events (llm_start, llm_end, tool_start, etc.) — pass through
        yield event

    await stream_task
    if stream_error:
        raise stream_error

    # Emit graph end event
    yield {
        "type": "trace:graph_end",
        "graph_id": graph_config.id,
        "graph_name": graph_config.name,
    }

    # Update execution with token counts
    execution.tokens_prompt = trace_handler.tokens.prompt_tokens
    execution.tokens_completion = trace_handler.tokens.completion_tokens

    # Get final state — serialize safely (LangChain messages aren't JSON-safe)
    final_state = await graph.aget_state(config)
    if final_state and final_state.values:
        safe_final: dict[str, Any] = {}
        for k, v in dict(final_state.values).items():
            if k == "messages" and isinstance(v, list):
                safe_final[k] = [
                    {
                        "role": getattr(m, "type", "unknown"),
                        "content": str(getattr(m, "content", m)),
                    }
                    if hasattr(m, "content")
                    else str(m)
                    for m in v
                ]
            else:
                try:
                    json.dumps(v)
                    safe_final[k] = v
                except (TypeError, ValueError):
                    safe_final[k] = str(v)[:OUTPUT_TRUNCATION_LENGTH]
        execution.output_data = safe_final
    else:
        execution.output_data = {}
