"""Node creators for supervisor and approval node types."""

from __future__ import annotations

import asyncio
import json as json_module
import logging
import re
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from .state import GraphState

if TYPE_CHECKING:
    from .interfaces import ConfigProviderProtocol, LLMProviderProtocol

NodeFn = Callable[[GraphState], Awaitable[dict[str, Any]]]

logger = logging.getLogger(__name__)


async def create_supervisor_node(
    node_id: str,
    node_data: dict[str, Any],
    config_provider: ConfigProviderProtocol,
    llm_provider: LLMProviderProtocol,
) -> NodeFn:
    """Create a supervisor node that routes to agents via LLM."""
    from .agent_invoker import AgentInvoker

    config = node_data.get("config", {})
    supervisor_agent_id = config.get("supervisorAgentId")
    worker_agent_ids = config.get("workerAgentIds")
    delegation_mode = config.get("delegationMode", "single")
    review_response = config.get("reviewResponse", False)
    max_delegations = config.get("maxDelegations", 3)
    custom_prompt = config.get("supervisorPrompt")

    invoker = AgentInvoker(config_provider, llm_provider)

    async def supervisor_node(state: GraphState, config: RunnableConfig) -> dict:
        logger.info("Supervisor %s: analyzing input for routing", node_id)

        if worker_agent_ids:
            workers = []
            for wid in worker_agent_ids:
                agent = await config_provider.get_agent_config(wid)
                if agent:
                    workers.append(agent)
        else:
            workers = await config_provider.list_agents()

        if not workers:
            return {
                "current_node": node_id,
                "error": "No worker agents available",
                "node_outputs": {node_id: {"error": "No worker agents available"}},
            }

        agent_catalog = "\n".join(
            f"- ID: {a.id} | Name: {a.name} | "
            f"Capabilities: {', '.join(a.capabilities) or 'general'} | "
            f"Description: {a.description}"
            for a in workers
        )

        user_message = state.get("input_prompt", "")
        last_messages = state.get("messages", [])[-3:]
        context_str = "\n".join(
            f"{'User' if hasattr(m, 'type') and m.type == 'human' else 'AI'}: {m.content}"
            for m in last_messages
        )

        routing_prompt = custom_prompt or (
            "You are a supervisor agent. Analyze the user's request and decide "
            "which agent(s) should handle it.\n\n"
            "Available agents:\n{agents}\n\n"
            "Recent conversation:\n{context}\n\n"
            "User request: {request}\n\n"
            "Respond with JSON only:\n"
            '{{"selected_agents": [{{"id": "agent-uuid", "instruction": "what to do"}}], '
            '"reasoning": "why these agents"}}'
        )

        routing_prompt = routing_prompt.format(
            agents=agent_catalog,
            context=context_str or "(no prior context)",
            request=user_message,
        )

        if supervisor_agent_id:
            routing_result = await invoker.invoke(
                supervisor_agent_id,
                state,
                override_prompt=routing_prompt,
                config=config,
            )
        else:
            llm = await llm_provider.get_model(workers[0].model_id)
            response = await llm.ainvoke(
                [
                    SystemMessage(content="You are a routing supervisor."),
                    AIMessage(content=routing_prompt),
                ],
                config=config,
            )
            routing_result = {"response": response.content}

        response_text = routing_result["response"]
        json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
        selected = []

        if json_match:
            try:
                decision = json_module.loads(json_match.group())
                raw_selected = decision.get("selected_agents", [])[:max_delegations]
                valid_worker_ids = {str(w.id) for w in workers}
                selected = [s for s in raw_selected if s.get("id") in valid_worker_ids]
                if len(selected) < len(raw_selected):
                    logger.warning(
                        "Supervisor %s: filtered %d invalid agent IDs",
                        node_id,
                        len(raw_selected) - len(selected),
                    )
            except json_module.JSONDecodeError:
                logger.warning("Supervisor %s: failed to parse routing JSON", node_id)

        if not selected:
            selected = [{"id": str(workers[0].id), "instruction": user_message}]

        delegation_results = await _delegate_to_agents(
            selected, delegation_mode, invoker, state, user_message, config
        )

        final_response = await _build_final_response(
            delegation_results,
            review_response,
            supervisor_agent_id,
            invoker,
            state,
            user_message,
            config,
        )

        return {
            "messages": [AIMessage(content=final_response)],
            "current_node": node_id,
            "node_outputs": {
                **state.get("node_outputs", {}),
                node_id: {
                    "routing_decision": selected,
                    "delegation_results": delegation_results,
                    "final_response": final_response,
                    "agents_used": [r.get("agent_id") for r in delegation_results],
                },
            },
            "delegation_context": {
                "supervisor_node": node_id,
                "delegations": delegation_results,
                "routing_history": state.get("delegation_context", {}).get(
                    "routing_history", []
                )
                + [{"node": node_id, "agents": [r.get("agent_id") for r in delegation_results]}],
            },
        }

    return supervisor_node


async def _delegate_to_agents(
    selected: list[dict],
    delegation_mode: str,
    invoker: Any,
    state: GraphState,
    user_message: str,
    config: RunnableConfig,
) -> list[dict]:
    """Delegate work to selected agents (single or parallel)."""
    frozen_state = dict(state)

    if delegation_mode == "single" or len(selected) == 1:
        agent_sel = selected[0]
        try:
            result = await invoker.invoke(
                agent_sel["id"],
                frozen_state,
                override_prompt=agent_sel.get("instruction", user_message),
                config=config,
            )
            return [
                {
                    "agent_id": agent_sel["id"],
                    "agent_name": result.get("agent_name", ""),
                    "response": result["response"],
                    "instruction": agent_sel.get("instruction", ""),
                }
            ]
        except Exception as e:
            logger.error("Supervisor: single delegation failed: %s", e)
            return [{"agent_id": agent_sel["id"], "error": str(e)}]

    async def delegate(sel: dict) -> dict:
        try:
            result = await invoker.invoke(
                sel["id"],
                frozen_state,
                override_prompt=sel.get("instruction", user_message),
                config=config,
            )
            return {
                "agent_id": sel["id"],
                "agent_name": result.get("agent_name", ""),
                "response": result["response"],
                "instruction": sel.get("instruction", ""),
            }
        except Exception as e:
            return {"agent_id": sel["id"], "error": str(e)}

    return list(await asyncio.gather(*[delegate(s) for s in selected]))


async def _build_final_response(
    delegation_results: list[dict],
    review_response: bool,
    supervisor_agent_id: str | None,
    invoker: Any,
    state: GraphState,
    user_message: str,
    config: RunnableConfig,
) -> str:
    """Build final response, optionally with supervisor review."""
    if review_response and supervisor_agent_id:
        review_prompt = (
            "Review and synthesize these agent responses:\n\n"
            + "\n\n".join(
                f"Agent {r.get('agent_name', r.get('agent_id', ''))}: "
                f"{r.get('response', r.get('error', ''))}"
                for r in delegation_results
            )
            + f"\n\nOriginal request: {user_message}\n\n"
            "Provide a final, coherent response to the user."
        )
        review_result = await invoker.invoke(
            supervisor_agent_id,
            state,
            override_prompt=review_prompt,
            config=config,
        )
        return review_result["response"]

    responses = [r["response"] for r in delegation_results if "response" in r]
    if len(responses) == 1:
        return responses[0]
    if responses:
        return "\n\n---\n\n".join(responses)
    return "No agent produced a response."


def create_approval_node(node_id: str, node_data: dict[str, Any]) -> NodeFn:
    """Create a human-in-the-loop approval gate."""
    node_config = node_data.get("config", {})
    timeout_seconds = node_config.get("approvalTimeout", 0)
    gate_message = node_config.get("message", "Review the plan above and approve to continue.")
    custom_options = node_config.get("options")  # [{label, value, variant}]

    async def approval_node(state: GraphState, config: RunnableConfig) -> dict:
        execution_id = (config or {}).get("configurable", {}).get("thread_id")
        if not execution_id:
            logger.warning("Approval node %s: no execution_id, skipping gate", node_id)
            return {"current_node": node_id}

        node_outputs = state.get("node_outputs", {})
        plan_parts = []
        for nid, out in node_outputs.items():
            resp = out.get("response", "") if isinstance(out, dict) else str(out)
            if resp:
                plan_parts.append(f"**{nid}**:\n{resp}")
        plan_summary = "\n\n---\n\n".join(plan_parts) if plan_parts else "(no plan)"

        logger.info(
            "Approval gate %s: requesting approval for execution %s", node_id, execution_id
        )

        from src.infra.config import get_settings as _get_approval_settings
        from src.infra.redis import get_redis_client as _get_redis

        settings = _get_approval_settings()

        stream_key = f"exec_stream:{execution_id}"

        r = await _get_redis()
        try:
            decision_key = f"approval_decision:{execution_id}"
            approval_ttl = settings.MAX_EXECUTION_TIMEOUT + 120
            await r.set(decision_key, "pending", ex=approval_ttl)
            await r.set(f"approval_node:{execution_id}", node_id, ex=approval_ttl)

            event_data: dict[str, Any] = {
                "type": "step",
                "event": "approval_required",
                "node_id": node_id,
                "execution_id": execution_id,
                "message": gate_message,
                "plan": plan_summary[:4000],
                "timeout_seconds": timeout_seconds,
            }
            if custom_options:
                event_data["options"] = custom_options

            await r.xadd(
                stream_key,
                {"data": json_module.dumps(event_data)},
            )

            logger.info("Approval gate %s: published approval_required event", node_id)

            poll_interval = 2.0

            while True:
                await asyncio.sleep(poll_interval)

                revoke = await r.get(f"revoke_intent:{execution_id}")
                if revoke and revoke.decode() == "cancel":
                    from src.executions.cancel import ExecutionCancelled

                    raise ExecutionCancelled()

                val = await r.get(decision_key)
                if val:
                    val_str = val.decode() if isinstance(val, bytes) else val
                    if val_str == "approved":
                        break
                    elif val_str == "rejected":
                        logger.info("Approval gate %s: REJECTED, stopping", node_id)
                        await r.delete(decision_key, f"approval_node:{execution_id}")
                        from src.executions.cancel import ExecutionCancelled

                        raise ExecutionCancelled()

            logger.info("Approval gate %s: APPROVED, continuing", node_id)
            await r.xadd(
                stream_key,
                {
                    "data": json_module.dumps(
                        {
                            "type": "step",
                            "event": "approval_granted",
                            "node_id": node_id,
                            "execution_id": execution_id,
                        }
                    )
                },
            )
            await r.delete(decision_key, f"approval_node:{execution_id}")
        finally:
            await r.aclose()

        return {
            "current_node": node_id,
            "node_outputs": {
                **state.get("node_outputs", {}),
                node_id: {"response": f"Approved by user. {gate_message}"},
            },
        }

    return approval_node
