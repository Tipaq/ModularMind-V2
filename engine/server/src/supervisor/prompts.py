"""
Supervisor routing prompt templates.

Provides the TASK layer template and builder for the Super Supervisor
routing LLM.  Identity and personality layers are loaded separately
via :mod:`src.prompt_layers`.  Keeps prompts concise for small model
context windows (e.g. Qwen3-8B ~8K).
"""

from src.graph_engine.interfaces import AgentConfig, GraphConfig
from src.mcp.schemas import MCPToolDefinition

# Hard limits for prompt size enforcement
MAX_AGENTS_IN_CATALOG = 20
MAX_GRAPHS_IN_CATALOG = 10
MAX_MCP_TOOLS_IN_CATALOG = 15
MAX_DESCRIPTION_CHARS = 100
MAX_HISTORY_MESSAGES = 5
MAX_HISTORY_CHARS = 2000
MAX_ROUTING_PROMPT_CHARS = 5000

ROUTING_TASK_TEMPLATE = """Your job is to analyze user messages and decide the best execution strategy.

Available strategies:
- DIRECT_RESPONSE: Answer directly without delegation (greetings, simple questions, meta-questions about the system)
- TOOL_RESPONSE: Answer using available MCP tools (web search, API calls, etc.) — use when the user's request needs external data you don't have
- DELEGATE_AGENT: Route to a specific existing agent
- EXECUTE_GRAPH: Execute a specific workflow graph
- CREATE_AGENT: Create a new ephemeral agent (when no existing agent fits)
- MULTI_ACTION: Combine multiple strategies for complex requests

Available agents:
{agent_catalog}

Available graphs:
{graph_catalog}

Available MCP tools:
{mcp_tool_catalog}

Recent conversation context:
{conversation_summary}

Last routed agent: {last_agent_info}

{memory_section}
{knowledge_section}
Respond with a JSON object matching this schema:
{{
  "strategy": "DIRECT_RESPONSE|TOOL_RESPONSE|DELEGATE_AGENT|EXECUTE_GRAPH|CREATE_AGENT|MULTI_ACTION",
  "agent_id": "uuid or null",
  "graph_id": "uuid or null",
  "reasoning": "brief explanation of routing decision",
  "confidence": 0.0-1.0,
  "direct_response": "response text (only for DIRECT_RESPONSE)",
  "ephemeral_config": {{ "name": "...", "description": "...", "system_prompt": "...", "capabilities": [...] }} (only for CREATE_AGENT)
}}

Rules:
- Use DIRECT_RESPONSE for greetings, small talk, simple factual questions, ANY question about your identity or capabilities ("who are you?", "what can you do?", "describe yourself"), and questions that can be answered using the provided knowledge context. YOU must answer these yourself — never delegate identity questions to an agent.
- Use TOOL_RESPONSE when the user needs information you can get via available tools (search, lookups, etc.)
- Use DELEGATE_AGENT when a specific agent clearly matches the request
- Use EXECUTE_GRAPH when the user requests a workflow or pipeline
- Prefer TOOL_RESPONSE over DIRECT_RESPONSE when tools can provide better, up-to-date information
- Prefer DELEGATE_AGENT over CREATE_AGENT — always
- NEVER choose CREATE_AGENT if an existing agent's capabilities match the request even partially — use DELEGATE_AGENT instead
- CREATE_AGENT is a last resort: only use it when the user explicitly asks for a new specialized assistant OR when absolutely no existing agent is even remotely relevant
- If no MCP tools are listed, never use TOOL_RESPONSE
- Output ONLY valid JSON, no extra text"""


def build_agent_catalog(agents: list[AgentConfig]) -> str:
    """Build a compact agent catalog string for the routing prompt.

    Truncates to MAX_AGENTS_IN_CATALOG agents, MAX_DESCRIPTION_CHARS per description.
    """
    if not agents:
        return "(none)"

    lines = []
    for agent in agents[:MAX_AGENTS_IN_CATALOG]:
        desc = agent.description[:MAX_DESCRIPTION_CHARS]
        caps = ", ".join(agent.capabilities[:5]) if agent.capabilities else "general"
        lines.append(f"- {agent.name} (id={agent.id}): {desc} [caps: {caps}]")
    if len(agents) > MAX_AGENTS_IN_CATALOG:
        lines.append(f"  ... and {len(agents) - MAX_AGENTS_IN_CATALOG} more agents")
    return "\n".join(lines)


def build_graph_catalog(graphs: list[GraphConfig]) -> str:
    """Build a compact graph catalog string for the routing prompt.

    Truncates to MAX_GRAPHS_IN_CATALOG graphs, MAX_DESCRIPTION_CHARS per description.
    """
    if not graphs:
        return "(none)"

    lines = []
    for graph in graphs[:MAX_GRAPHS_IN_CATALOG]:
        desc = graph.description[:MAX_DESCRIPTION_CHARS]
        lines.append(f"- {graph.name} (id={graph.id}): {desc}")
    if len(graphs) > MAX_GRAPHS_IN_CATALOG:
        lines.append(f"  ... and {len(graphs) - MAX_GRAPHS_IN_CATALOG} more graphs")
    return "\n".join(lines)


def build_mcp_tool_catalog(
    tools_by_server: dict[str, list[MCPToolDefinition]],
) -> str:
    """Build a compact MCP tool catalog for the routing prompt.

    Args:
        tools_by_server: Mapping of server_name → list of tool definitions.

    Returns:
        Formatted string listing available tools, or "(none)" if empty.
    """
    if not tools_by_server:
        return "(none — TOOL_RESPONSE not available)"

    lines: list[str] = []
    tool_count = 0
    for server_name, tools in tools_by_server.items():
        for tool in tools:
            if tool_count >= MAX_MCP_TOOLS_IN_CATALOG:
                remaining = sum(len(t) for t in tools_by_server.values()) - tool_count
                if remaining > 0:
                    lines.append(f"  ... and {remaining} more tools")
                return "\n".join(lines)
            desc = (tool.description or tool.name)[:MAX_DESCRIPTION_CHARS]
            lines.append(f"- {tool.name} ({server_name}): {desc}")
            tool_count += 1

    return "\n".join(lines) if lines else "(none — TOOL_RESPONSE not available)"


def build_conversation_summary(messages: list[dict]) -> str:
    """Build a compact conversation summary from recent messages.

    Takes last MAX_HISTORY_MESSAGES messages, truncates total to MAX_HISTORY_CHARS.
    """
    if not messages:
        return "(new conversation)"

    recent = messages[-MAX_HISTORY_MESSAGES:]
    lines = []
    total_chars = 0
    for msg in recent:
        role = msg.get("role", "?")
        content = msg.get("content", "")
        # Truncate individual messages
        if len(content) > 200:
            content = content[:200] + "..."
        line = f"{role}: {content}"
        if total_chars + len(line) > MAX_HISTORY_CHARS:
            break
        lines.append(line)
        total_chars += len(line)

    return "\n".join(lines) if lines else "(context too large, summarized)"


def build_routing_task_prompt(
    agents: list[AgentConfig],
    graphs: list[GraphConfig],
    history: list[dict],
    last_agent: str | None = None,
    mcp_tools: dict[str, list[MCPToolDefinition]] | None = None,
    memory_context: str = "",
    knowledge_context: str = "",
) -> str:
    """Build the complete routing prompt with size enforcement.

    Args:
        agents: Available agent configs
        graphs: Available graph configs
        history: Recent conversation messages
        last_agent: Last routed agent name/id (for affinity hint)
        mcp_tools: Optional mapping of server_name → list of tool definitions
        memory_context: Pre-formatted memory context string
        knowledge_context: Pre-formatted RAG knowledge context string

    Returns:
        Complete prompt string, guaranteed under MAX_ROUTING_PROMPT_CHARS
    """
    agent_catalog = build_agent_catalog(agents)
    graph_catalog = build_graph_catalog(graphs)
    mcp_tool_catalog = build_mcp_tool_catalog(mcp_tools or {})
    conversation_summary = build_conversation_summary(history)
    last_agent_info = last_agent or "(none — new conversation or topic change)"
    memory_section = f"User profile:\n{memory_context}" if memory_context else ""
    knowledge_section = (
        f"Relevant knowledge from documents (use this to answer directly when sufficient):\n{knowledge_context}"
        if knowledge_context
        else ""
    )

    fmt_kwargs = dict(
        agent_catalog=agent_catalog,
        graph_catalog=graph_catalog,
        mcp_tool_catalog=mcp_tool_catalog,
        conversation_summary=conversation_summary,
        last_agent_info=last_agent_info,
        memory_section=memory_section,
        knowledge_section=knowledge_section,
    )

    prompt = ROUTING_TASK_TEMPLATE.format(**fmt_kwargs)

    # Enforce hard limit — drop context progressively
    if len(prompt) > MAX_ROUTING_PROMPT_CHARS:
        # First: drop conversation summary
        fmt_kwargs["conversation_summary"] = "(trimmed for size)"
        prompt = ROUTING_TASK_TEMPLATE.format(**fmt_kwargs)

    if len(prompt) > MAX_ROUTING_PROMPT_CHARS:
        # Second: truncate agent descriptions
        fmt_kwargs["agent_catalog"] = build_agent_catalog(agents[:10])
        prompt = ROUTING_TASK_TEMPLATE.format(**fmt_kwargs)

    if len(prompt) > MAX_ROUTING_PROMPT_CHARS:
        # Third: truncate graph, tool, memory, and knowledge
        fmt_kwargs["graph_catalog"] = build_graph_catalog(graphs[:5])
        fmt_kwargs["mcp_tool_catalog"] = "(trimmed for size)"
        fmt_kwargs["memory_section"] = ""
        fmt_kwargs["knowledge_section"] = ""
        prompt = ROUTING_TASK_TEMPLATE.format(**fmt_kwargs)

    return prompt
