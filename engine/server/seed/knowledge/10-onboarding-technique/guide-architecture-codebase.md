# Codebase Architecture Walkthrough — ModularMind

## Repository Structure

ModularMind is a monorepo containing 3 applications, 2 shared packages, and 1 Python backend:

```
ModularMind-V2/
├── apps/
│   ├── chat/              # User-facing chat interface (Vite + React)
│   └── ops/               # Admin console (Vite + React)
├── packages/
│   ├── ui/                # Shared UI components (@modularmind/ui)
│   └── api-client/        # Typed HTTP client (@modularmind/api-client)
├── engine/
│   └── server/            # Python backend (FastAPI)
│       └── src/
│           ├── agents/    # Agent config provider (read-only)
│           ├── auth/      # JWT auth, roles, middleware
│           ├── conversations/ # Chat CRUD + messages
│           ├── executions/    # Execution runs, SSE streaming
│           ├── graph_engine/  # LangGraph compiler + nodes
│           ├── graphs/        # Graph config provider
│           ├── infra/         # DB, Redis, Qdrant, config, rate limit
│           ├── llm/           # LLM providers (Ollama, OpenAI, Anthropic)
│           ├── mcp/           # MCP tool registry + sidecars
│           ├── memory/        # Memory system (facts, vectors, graph)
│           ├── pipeline/      # Memory pipeline handlers
│           ├── rag/           # RAG (chunker, retriever, reranker)
│           ├── sync/          # Config sync from Platform
│           ├── report/        # Metrics reporting
│           └── worker/        # Redis Streams consumer + scheduler
├── platform/              # Next.js 16 (admin + studio + marketing)
├── shared/                # Python shared schemas
└── docker/                # Docker Compose + Nginx configs
```

## How a Message Flows Through the System

When a user sends "How do I configure SSO?" in the Chat app:

### 1. Frontend (apps/chat)
- React component calls `apiClient.conversations.sendMessage(convId, content)`
- Opens an EventSource to the SSE streaming endpoint
- Renders tokens as they arrive

### 2. API Layer (engine/server/src)
- `POST /conversations/{id}/messages` or `GET .../messages/stream`
- Auth middleware validates JWT from cookie
- Loads agent configuration from ConfigProvider
- Identifies the assigned graph (if any)

### 3. Graph Engine (engine/server/src/graph_engine)
- Compiler translates graph JSON into LangGraph StateGraph
- Executes nodes sequentially/parallel based on edges:
  - **RAG Node**: calls `rag/retriever.py` → Qdrant hybrid search
  - **Memory Node**: calls `memory/repository.py` → recalls relevant memories
  - **LLM Node**: calls `llm/provider.py` → sends messages to model

### 4. LLM Provider (engine/server/src/llm)
- Routes to the configured provider (Ollama, OpenAI, Anthropic)
- Streams tokens via async generator
- Handles tool calls if the model requests them

### 5. SSE Response (engine/server/src/infra/sse.py)
- Wraps the token stream in SSE format
- Sends events: `message_start`, `content_delta`, `rag_context`, `message_end`
- Client renders tokens progressively

### 6. Background Pipeline (engine/server/src/worker)
- After response completes, publishes to `memory:raw` Redis Stream
- Worker picks up: extracts facts (LLM-based), embeds them, stores in Qdrant
- Memory graph builder creates edges between related memories

## Key Design Patterns

### Config-Driven Agents
Agents are pure configuration (no code). The ConfigProvider reads agent JSON from the database, and the graph engine uses it to construct execution flows.

### Repository Pattern
Each domain (memory, rag, conversations) has a repository class that encapsulates database operations. Routes call repositories, not raw SQL.

### Event-Driven Pipeline
Heavy operations (document processing, memory extraction) go through Redis Streams. The API responds immediately, and the Worker processes asynchronously.

### Shared Nothing Between Apps
The 3 frontend apps share code only through the `packages/` directory. They don't share state, routing, or build configuration.