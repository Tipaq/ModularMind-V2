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
- TOOL_RESPONSE: Answer using tools — search_tools finds any available tool by keyword, then use_tool executes it. Always available.
- DELEGATE_AGENT: Route to a specific existing agent
- EXECUTE_GRAPH: Execute a specific workflow graph
- CREATE_AGENT: Create a new ephemeral agent (when no existing agent fits)
- MULTI_ACTION: Combine multiple strategies for complex requests

Available agents:
{agent_catalog}

Available graphs:
{graph_catalog}

Available tools (all searchable via search_tools by keyword):
{tool_catalog}

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
  "extracted_prompt": "the refined task/question to send to the agent (only for DELEGATE_AGENT/EXECUTE_GRAPH/CREATE_AGENT)",
  "reasoning": "brief explanation of routing decision",
  "confidence": 0.0-1.0,
  "ephemeral_config": {{ "name": "...", "description": "...", "system_prompt": "...", "capabilities": [...], "tool_categories": {{ "shell": true, "filesystem": true, ... }} }} (only for CREATE_AGENT — enable tool categories the agent needs)
}}

Rules:
- When using DELEGATE_AGENT, EXECUTE_GRAPH, or CREATE_AGENT, always provide "extracted_prompt" — a clear, focused reformulation of the user's request tailored for the target agent. Strip meta-language ("can you", "I'd like to"), conversation references, and anything irrelevant to the agent's task. If the user's message is already a clear task, keep it as-is.
- Use DIRECT_RESPONSE for greetings, small talk, simple factual questions, ANY question about your identity or capabilities ("who are you?", "what can you do?", "describe yourself"), and questions that can be answered using the provided knowledge context. YOU must answer these yourself — never delegate identity questions to an agent.
- Use TOOL_RESPONSE when the user needs a simple tool action (search, scheduling, file ops, web lookup, code search, etc.) — search_tools will find the right tool by keyword
- Use DELEGATE_AGENT when a specific agent clearly matches the request or the task requires multi-step reasoning with tools
- Use EXECUTE_GRAPH when the user requests a workflow, pipeline, or a multi-step task that matches a graph (e.g. "resolve this issue", "fix this PR"). ALWAYS prefer EXECUTE_GRAPH over DELEGATE_AGENT when a graph exists for the task.
- Prefer TOOL_RESPONSE over DIRECT_RESPONSE when tools can provide better, up-to-date information
- Prefer TOOL_RESPONSE over DELEGATE_AGENT for simple, single-tool tasks (e.g. "create a scheduled task", "search my knowledge base", "check repo status")
- Prefer DELEGATE_AGENT over CREATE_AGENT — always
- NEVER choose CREATE_AGENT if an existing agent's capabilities match the request even partially — use DELEGATE_AGENT instead
- CREATE_AGENT is a last resort: only use it when the user explicitly asks for a new specialized assistant OR when absolutely no existing agent is even remotely relevant
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


_TOOL_CATEGORY_DESCRIPTIONS: dict[str, str] = {
    "knowledge": "Search documents and knowledge bases",
    "scheduling": "Create/manage scheduled tasks and cron jobs",
    "web": "Web search, browse URLs, take screenshots",
    "file_storage": "Upload/download/manage files",
    "image_generation": "Generate images",
    "github": "GitHub repos, issues, PRs",
    "git": "Clone, commit, push, branch operations",
    "filesystem": "Read/write/search local files",
    "human_interaction": "Request user approval or input",
    "custom_tools": "Custom agent-defined tools",
    "mini_apps": "Interactive mini-applications",
    "gateway": "Shell execution, network requests",
    "builtin": "Search past conversations, update user profile",
}


def build_tool_category_catalog(
    allowed_categories: list[str] | None = None,
    mcp_tools: dict[str, list[MCPToolDefinition]] | None = None,
) -> str:
    """Build a unified tool catalog for the routing prompt.

    Includes built-in categories and MCP server tools in a single list.
    MCP tools are listed by server name with individual tool descriptions.

    Args:
        allowed_categories: Category whitelist (None = all categories).
        mcp_tools: Mapping of server_name → list of tool definitions.

    Returns:
        Formatted string listing all available tools by category/server.
    """
    lines: list[str] = []
    for category, description in _TOOL_CATEGORY_DESCRIPTIONS.items():
        if allowed_categories is not None and category not in allowed_categories:
            continue
        lines.append(f"- {category}: {description}")

    if mcp_tools:
        tool_count = 0
        for server_name, tools in mcp_tools.items():
            for tool in tools:
                if tool_count >= MAX_MCP_TOOLS_IN_CATALOG:
                    remaining = sum(len(t) for t in mcp_tools.values()) - tool_count
                    if remaining > 0:
                        lines.append(f"  ... and {remaining} more tools")
                    return "\n".join(lines)
                desc = (tool.description or tool.name)[:MAX_DESCRIPTION_CHARS]
                lines.append(f"- {tool.name} ({server_name}): {desc}")
                tool_count += 1

    return "\n".join(lines) if lines else "(none)"


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
    allowed_tool_categories: list[str] | None = None,
) -> str:
    """Build the complete routing prompt with size enforcement.

    Args:
        agents: Available agent configs
        graphs: Available graph configs
        history: Recent conversation messages
        last_agent: Last routed agent name/id (for affinity hint)
        mcp_tools: Optional mapping of server_name → list of tool definitions.
        memory_context: Pre-formatted memory context string
        knowledge_context: Pre-formatted RAG knowledge context string
        allowed_tool_categories: Whitelist for tool categories (None = all).

    Returns:
        Complete prompt string, guaranteed under MAX_ROUTING_PROMPT_CHARS
    """
    agent_catalog = build_agent_catalog(agents)
    graph_catalog = build_graph_catalog(graphs)
    tool_catalog = build_tool_category_catalog(allowed_tool_categories, mcp_tools)
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
        tool_catalog=tool_catalog,
        conversation_summary=conversation_summary,
        last_agent_info=last_agent_info,
        memory_section=memory_section,
        knowledge_section=knowledge_section,
    )

    prompt = ROUTING_TASK_TEMPLATE.format(**fmt_kwargs)

    # Enforce hard limit — drop context progressively
    if len(prompt) > MAX_ROUTING_PROMPT_CHARS:
        fmt_kwargs["conversation_summary"] = "(trimmed for size)"
        prompt = ROUTING_TASK_TEMPLATE.format(**fmt_kwargs)

    if len(prompt) > MAX_ROUTING_PROMPT_CHARS:
        fmt_kwargs["agent_catalog"] = build_agent_catalog(agents[:10])
        prompt = ROUTING_TASK_TEMPLATE.format(**fmt_kwargs)

    if len(prompt) > MAX_ROUTING_PROMPT_CHARS:
        fmt_kwargs["graph_catalog"] = build_graph_catalog(graphs[:5])
        fmt_kwargs["tool_catalog"] = "(trimmed for size)"
        fmt_kwargs["memory_section"] = ""
        fmt_kwargs["knowledge_section"] = ""
        prompt = ROUTING_TASK_TEMPLATE.format(**fmt_kwargs)

    return prompt
