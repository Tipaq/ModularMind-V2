# ADR-005: LangGraph vs Custom Graph Engine

## Status

**Accepted** — 2025-08-20

## Context

ModularMind needs a graph execution engine to run multi-step AI workflows. Agents can be configured with visual graphs that define how messages flow through LLM calls, tool executions, memory operations, and conditional routing.

Requirements:
- Stateful execution with checkpointing
- Conditional branching based on LLM output
- Tool calling loop (LLM decides → tool executes → LLM continues)
- Parallel node execution where possible
- Human-in-the-loop capability (future requirement)
- Integration with our existing infrastructure (Redis, PostgreSQL, Qdrant)

## Decision

**We chose LangGraph with a custom compilation layer (`graph_engine/compiler.py`).**

LangGraph provides the core state machine semantics (nodes, edges, conditional routing, checkpointing) while our compiler layer translates our visual graph JSON format into LangGraph-compatible graphs.

### Why Not Pure Custom

Building a graph execution engine from scratch would require implementing:
- State management and checkpointing
- Conditional edge routing
- Cycle detection and iteration limits
- Tool calling loops with state persistence
- Error handling and retry logic per node

LangGraph already solves these problems with a well-tested implementation. Writing our own would take 3-4 months and introduce significant risk.

### Why Not Pure LangGraph

LangGraph's built-in node types are too coupled to LangChain:
- Assumes LangChain's `ChatModel` interface
- Tool calling uses LangChain's `BaseTool` abstraction
- Memory uses LangChain's memory classes

We need our own node types that integrate with:
- Our multi-provider LLM layer (Ollama, OpenAI, Anthropic)
- Our MCP tool registry
- Our custom memory system (Qdrant-backed, multi-scope)
- Our RAG pipeline

### Architecture

```
Visual Graph JSON (from Studio)
        │
        ▼
  ┌─────────────┐
  │  Compiler    │  Translates JSON → LangGraph StateGraph
  │  (custom)    │  Maps node types to our implementations
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  LangGraph   │  Executes the state machine
  │  StateGraph  │  Handles routing, checkpoints, cycles
  └──────┬──────┘
         │
    ┌────┼────┬────────┐
    ▼    ▼    ▼        ▼
  LLM  Tool  Memory   RAG     (Our custom node implementations)
  Node  Node  Node    Node
```

### Custom Node Implementations

```python
async def llm_node(state: GraphState) -> GraphState:
    """Custom LLM node using our multi-provider layer."""
    provider = get_llm_provider(state.config.provider)
    response = await provider.chat(
        model=state.config.model,
        messages=state.messages,
        temperature=state.config.temperature,
        tools=state.available_tools,
    )
    state.messages.append(response.message)
    return state

async def tool_node(state: GraphState) -> GraphState:
    """Custom tool node using our MCP registry."""
    tool = await mcp_registry.get_tool(state.pending_tool_call.name)
    result = await tool.execute(state.pending_tool_call.arguments)
    state.messages.append(ToolMessage(content=result))
    return state

async def should_continue(state: GraphState) -> str:
    """Conditional edge: continue tool loop or respond."""
    last_message = state.messages[-1]
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "tool_node"
    return "respond"
```

### Compilation Example

Input (Visual Graph JSON):
```json
{
  "nodes": [
    {"id": "entry", "type": "entry"},
    {"id": "rag", "type": "rag", "config": {"collections": ["docs"]}},
    {"id": "llm", "type": "llm", "config": {"model": "gpt-4o"}},
    {"id": "exit", "type": "exit"}
  ],
  "edges": [
    {"source": "entry", "target": "rag"},
    {"source": "rag", "target": "llm"},
    {"source": "llm", "target": "exit"}
  ]
}
```

Compiled output: LangGraph `StateGraph` with custom node functions.

## Consequences

### Positive
- Leverages LangGraph's battle-tested state machine logic
- Custom nodes integrate cleanly with our infrastructure
- Visual graph format is decoupled from execution engine
- Checkpointing enables conversation continuity across sessions
- Tool calling loop is robust and handles complex multi-turn tool use

### Negative
- LangGraph is a dependency we must keep updated
- Debugging graph execution requires understanding both our compiler and LangGraph internals
- LangGraph API changes could require compiler updates
