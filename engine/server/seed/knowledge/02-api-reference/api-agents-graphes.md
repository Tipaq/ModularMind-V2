# API Reference — Agents & Graphs

## Overview

The Agents and Graphs API provides CRUD operations for managing AI agent configurations and graph-based workflows. Agents define the LLM behavior, while Graphs define multi-step execution flows.

## Agent Endpoints

### GET /agents

List all configured agents.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | — | Filter: `active`, `inactive`, `draft` |
| `model` | string | — | Filter by model name |

**Response (200):**
```json
{
  "items": [
    {
      "id": "agt_support01",
      "name": "Support Agent",
      "description": "Customer support assistant with knowledge base access",
      "model": {
        "provider": "openai",
        "name": "gpt-4o-mini",
        "temperature": 0.3,
        "max_tokens": 2048
      },
      "status": "active",
      "tools": ["search_docs", "create_jira_ticket"],
      "collections": ["col_faq", "col_docs"],
      "graph_id": "grp_support_flow",
      "conversation_count": 234,
      "created_at": "2025-09-01T10:00:00Z",
      "updated_at": "2026-02-15T14:30:00Z"
    }
  ],
  "total": 8
}
```

### POST /agents

Create a new agent configuration.

**Request:**
```json
{
  "name": "Code Review Agent",
  "description": "Reviews code changes and suggests improvements",
  "model": {
    "provider": "anthropic",
    "name": "claude-sonnet-4-6",
    "temperature": 0.2,
    "max_tokens": 4096
  },
  "system_prompt": "You are an expert code reviewer. Analyze code changes for bugs, security issues, performance problems, and style violations. Be constructive and specific in your feedback.",
  "tools": ["query_github", "search_docs"],
  "collections": ["col_coding_standards"],
  "memory_config": {
    "enabled": true,
    "scope": "agent",
    "extraction": true
  }
}
```

**Response (201):**
```json
{
  "id": "agt_codereview01",
  "name": "Code Review Agent",
  "status": "draft",
  "created_at": "2026-03-01T10:00:00Z"
}
```

### GET /agents/{agent_id}

Get detailed agent configuration.

### PUT /agents/{agent_id}

Update an agent's configuration. Changes take effect immediately for new conversations.

### DELETE /agents/{agent_id}

Deactivate an agent. Existing conversations are preserved but no new ones can be created.

### POST /agents/{agent_id}/activate

Set agent status to `active`, making it available for conversations.

### POST /agents/{agent_id}/deactivate

Set agent status to `inactive`, hiding it from users while preserving configuration.

---

## Graph Endpoints

### GET /graphs

List all graph workflow definitions.

**Response (200):**
```json
{
  "items": [
    {
      "id": "grp_support_flow",
      "name": "Support Escalation Flow",
      "description": "Multi-step support with RAG lookup, memory recall, and escalation",
      "version": 3,
      "status": "published",
      "node_count": 7,
      "agent_count": 2,
      "created_at": "2025-11-01T10:00:00Z",
      "updated_at": "2026-02-20T16:00:00Z"
    }
  ],
  "total": 5
}
```

### POST /graphs

Create a new graph workflow.

**Request:**
```json
{
  "name": "RAG-Enhanced Chat",
  "description": "Chat flow with knowledge base retrieval and memory",
  "nodes": [
    {
      "id": "entry",
      "type": "entry",
      "position": { "x": 100, "y": 200 }
    },
    {
      "id": "rag_lookup",
      "type": "rag",
      "config": {
        "collections": ["col_docs"],
        "limit": 5,
        "threshold": 0.7
      },
      "position": { "x": 300, "y": 200 }
    },
    {
      "id": "memory_recall",
      "type": "memory",
      "config": {
        "mode": "read",
        "scope": "cross_conversation",
        "limit": 3
      },
      "position": { "x": 300, "y": 400 }
    },
    {
      "id": "llm_respond",
      "type": "llm",
      "config": {
        "model": { "provider": "openai", "name": "gpt-4o" },
        "temperature": 0.5,
        "system_prompt": "Use the provided context and memories to answer accurately."
      },
      "position": { "x": 600, "y": 300 }
    },
    {
      "id": "memory_write",
      "type": "memory",
      "config": {
        "mode": "write",
        "extraction": true
      },
      "position": { "x": 800, "y": 300 }
    },
    {
      "id": "exit",
      "type": "exit",
      "position": { "x": 1000, "y": 300 }
    }
  ],
  "edges": [
    { "source": "entry", "target": "rag_lookup" },
    { "source": "entry", "target": "memory_recall" },
    { "source": "rag_lookup", "target": "llm_respond" },
    { "source": "memory_recall", "target": "llm_respond" },
    { "source": "llm_respond", "target": "memory_write" },
    { "source": "memory_write", "target": "exit" }
  ]
}
```

### GET /graphs/{graph_id}

Get full graph definition including nodes, edges, and configuration.

### PUT /graphs/{graph_id}

Update a graph definition. Creates a new version automatically.

### DELETE /graphs/{graph_id}

Archive a graph. Agents using this graph will fall back to direct LLM mode.

### POST /graphs/{graph_id}/publish

Publish a draft graph, making it available for agent assignment.

### POST /graphs/{graph_id}/test

Execute a test run of the graph with a sample input.

**Request:**
```json
{
  "input": "How do I configure SSO for my organization?",
  "trace": true
}
```

**Response (200):**
```json
{
  "output": "To configure SSO for your organization...",
  "trace": [
    {
      "node_id": "rag_lookup",
      "duration_ms": 150,
      "output_summary": "Found 3 relevant chunks from sso-guide.md"
    },
    {
      "node_id": "memory_recall",
      "duration_ms": 45,
      "output_summary": "No relevant memories found"
    },
    {
      "node_id": "llm_respond",
      "duration_ms": 2300,
      "output_summary": "Generated response (350 tokens)"
    }
  ],
  "total_duration_ms": 2520,
  "tokens_used": 1580
}
```

## Node Types Reference

| Type | Description | Config Fields |
|------|-------------|---------------|
| `entry` | Graph entry point | — |
| `exit` | Graph exit point | — |
| `llm` | LLM invocation | model, temperature, system_prompt, max_tokens |
| `tool` | MCP tool execution | tool_name, parameters, timeout |
| `condition` | Conditional branching | expression, true_target, false_target |
| `router` | Multi-path routing | routes[], default_target |
| `rag` | Knowledge retrieval | collections, limit, threshold |
| `memory` | Memory read/write | mode (read/write), scope, limit |
| `transform` | Data transformation | template, output_key |

## Graph Validation Rules

Before publishing, a graph must pass validation:

1. Exactly one `entry` node
2. At least one `exit` node
3. All nodes must be reachable from `entry`
4. No orphaned nodes (disconnected from the graph)
5. No infinite loops without a condition/limit
6. All referenced tools must exist in the MCP registry
7. All referenced collections must exist and be accessible
