# ModularMind V2

**AI Agent Orchestration Platform** — multi-model, multi-provider, with memory, RAG, visual graph workflows, and secure tool execution.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [System Architecture](#system-architecture)
- [Core Systems](#core-systems)
  - [Execution Flow](#execution-flow)
  - [Graph Engine](#graph-engine)
  - [Worker & Redis Streams](#worker--redis-streams)
  - [RAG Pipeline](#rag-pipeline)
  - [Memory Pipeline](#memory-pipeline)
  - [MCP Tools](#mcp-tools)
  - [LLM Providers](#llm-providers)
  - [SSE Streaming](#sse-streaming)
  - [Gateway & Sandbox](#gateway--sandbox)
- [Frontend Architecture](#frontend-architecture)
  - [Chat App](#chat-app)
  - [Ops App](#ops-app)
  - [Platform](#platform)
  - [Shared UI Library](#shared-ui-library)
  - [API Client](#api-client)
- [Authentication](#authentication)
- [Deployment](#deployment)
  - [Client Stack](#client-stack-7-containers)
  - [Platform Stack](#platform-stack-3-containers)
  - [Monitoring Stack](#monitoring-stack)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
  - [Commands](#commands)
- [CI/CD](#cicd)
- [Environment Variables](#environment-variables)

---

## Overview

ModularMind is a self-hosted AI agent orchestration platform. It lets you design, deploy, and manage AI agents with visual graph workflows, connect them to any LLM provider, give them tools via MCP, augment them with RAG knowledge bases, and interact with them through a chat interface — all with enterprise-grade auth, monitoring, and multi-tenant support.

```
┌─────────────────────────────────────────────────────────────────┐
│                        ModularMind V2                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────────────┐│
│  │ Chat App │  │ Ops App  │  │         Platform (Next.js)     ││
│  │ (React)  │  │ (React)  │  │  Studio · Admin · Marketing   ││
│  └────┬─────┘  └────┬─────┘  └──────────────┬────────────────┘│
│       │              │                       │                  │
│       └──────┬───────┘                       │                  │
│              │ SSE + REST                    │ Sync (polling)   │
│              ▼                               ▼                  │
│  ┌───────────────────────────────────────────────────────┐      │
│  │                    Engine (FastAPI)                    │      │
│  │  Agents · Graphs · Executions · RAG · Memory · MCP   │      │
│  └──────────────────────┬────────────────────────────────┘      │
│                         │                                       │
│              ┌──────────┴──────────┐                            │
│              ▼                     ▼                            │
│  ┌────────────────┐    ┌────────────────┐                      │
│  │    Worker       │    │    Gateway     │                      │
│  │ Redis Streams   │    │  Sandbox Exec  │                      │
│  │  + Scheduler    │    │  Browser/Shell │                      │
│  └────────────────┘    └────────────────┘                      │
│                                                                 │
│  ┌──────────┐ ┌───────┐ ┌────────┐ ┌───────┐ ┌──────────────┐ │
│  │PostgreSQL│ │ Redis │ │ Qdrant │ │ MinIO │ │ Ollama/Cloud │ │
│  └──────────┘ └───────┘ └────────┘ └───────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### High-Level Data Flow

```
                    User
                     │
                     ▼
              ┌─────────────┐
              │    Nginx     │  :80 / :443
              │  (Reverse    │
              │   Proxy)     │
              └──────┬───┬──┘
                     │   │
          ┌──────────┘   └──────────┐
          ▼                         ▼
   ┌─────────────┐          ┌─────────────┐
   │  Chat / Ops │          │  Engine API  │  :8000
   │  Static SPA │          │  (FastAPI)   │
   │  (baked in  │          └──────┬───────┘
   │   nginx)    │                 │
   └─────────────┘                 │
                          ┌────────┼────────┐
                          ▼        ▼        ▼
                   ┌────────┐ ┌────────┐ ┌────────┐
                   │ Worker │ │Gateway │ │  SSE   │
                   │Redis   │ │:8200   │ │Stream  │
                   │Streams │ │Sandbox │ │Response│
                   └────────┘ └────────┘ └────────┘
```

### Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Task Queue | Redis Streams | Lightweight, no extra infra, consumer groups, DLQ support |
| Real-time | SSE (Server-Sent Events) | Simpler than WebSocket, works through proxies, one-directional |
| Config Sync | Pull-based polling | Engine polls Platform — decoupled, no push infra needed |
| Tool Execution | MCP Protocol | Standard protocol, extensible, supports Docker sidecars |
| Vector Store | Qdrant | Fast hybrid search (dense + sparse), ACL filtering |
| Object Storage | MinIO (S3-compatible) | Self-hosted, same API as AWS S3 |
| Graph Runtime | LangGraph | State machines, checkpointing, tool loops, parallel branches |

---

## Tech Stack

### Backend
| Component | Technology |
|-----------|------------|
| API Server | Python 3.12, FastAPI, Uvicorn |
| Graph Runtime | LangGraph, LangChain |
| Database | PostgreSQL 16, SQLAlchemy 2.0 (async), Alembic |
| Cache & Queue | Redis 7 (Streams, consumer groups) |
| Vector DB | Qdrant v1.13 |
| Object Storage | MinIO (S3-compatible) |
| Scheduler | APScheduler 3.10 |
| LLM Providers | Ollama, OpenAI, Anthropic, vLLM, TGI |
| Embeddings | nomic-embed-text (Ollama), OpenAI |
| Monitoring | Prometheus, Grafana |

### Frontend
| Component | Technology |
|-----------|------------|
| Chat App | Vite, React, React Router v7 |
| Ops App | Vite, React, React Router v7 |
| Platform | Next.js 16, App Router |
| UI Library | shadcn/ui, Tailwind CSS v4 |
| State | Zustand |
| API Client | Custom typed HTTP client |
| Auth | JWT (HttpOnly cookies), NextAuth v5 |
| Charts | Recharts |
| Graphs | @xyflow/react, Sigma.js |

### Infrastructure
| Component | Technology |
|-----------|------------|
| Containers | Docker, Docker Compose |
| Reverse Proxy | Nginx |
| Monorepo | pnpm workspaces, Turborepo |
| CI/CD | GitHub Actions |
| Linting | Ruff (Python), ESLint (TypeScript) |

---

## Project Structure

```
ModularMind-V2/
│
├── apps/
│   ├── chat/                    # Vite + React SPA — user-facing chat
│   │   ├── src/
│   │   │   ├── components/      # Chat-specific components
│   │   │   ├── hooks/           # useChat, useConversations, useChatConfig
│   │   │   ├── pages/           # Chat, Login, Settings, Profile
│   │   │   ├── App.tsx          # Router setup (React Router v7)
│   │   │   └── main.tsx         # Entry point
│   │   └── vite.config.ts
│   │
│   └── ops/                     # Vite + React SPA — admin console
│       ├── src/
│       │   ├── components/      # Dashboard, monitoring, config UI
│       │   ├── hooks/           # Admin-specific hooks
│       │   ├── pages/           # Dashboard, Models, Knowledge, Users, etc.
│       │   ├── App.tsx          # Router (basename="/ops")
│       │   └── main.tsx
│       └── vite.config.ts
│
├── packages/
│   ├── ui/                      # @modularmind/ui — shared component library
│   │   ├── src/
│   │   │   ├── components/      # 60+ components (shadcn/ui + custom)
│   │   │   ├── hooks/           # useAuth, useExecutionActivities
│   │   │   ├── lib/             # Colors, mappers, validators
│   │   │   ├── stores/          # Zustand auth store
│   │   │   ├── styles/          # theme.css (design tokens)
│   │   │   └── theme/           # ThemeProvider, presets
│   │   └── package.json
│   │
│   └── api-client/              # @modularmind/api-client — typed HTTP client
│       ├── src/
│       │   ├── client.ts        # ApiClient (HttpOnly cookie auth, auto-refresh)
│       │   ├── types/           # Auth, Agent, Graph, Execution, etc.
│       │   └── utils.ts         # snake_case ↔ camelCase
│       └── package.json
│
├── engine/
│   └── server/                  # Python FastAPI — API + Worker
│       ├── src/
│       │   ├── main.py          # FastAPI app (lifespan, middleware, routers)
│       │   ├── agents/          # Agent config (read-only from ConfigProvider)
│       │   ├── auth/            # JWT auth, roles, dependencies
│       │   ├── conversations/   # Chat conversations + messages
│       │   ├── executions/      # Execution runs, SSE streaming
│       │   ├── graph_engine/    # LangGraph compiler, state, tool loop
│       │   │   ├── compiler.py  # Graph → LangGraph StateGraph
│       │   │   ├── state.py     # GraphState TypedDict
│       │   │   ├── tool_loop.py # ReAct tool-calling loop
│       │   │   └── builtin_tools.py
│       │   ├── graphs/          # Graph config (read-only)
│       │   ├── infra/           # DB, Redis, Qdrant, S3, SSE, config
│       │   │   ├── config.py    # Pydantic Settings
│       │   │   ├── database.py  # SQLAlchemy async
│       │   │   ├── redis.py     # Redis client
│       │   │   ├── redis_streams.py  # Stream bus (consumer groups)
│       │   │   ├── qdrant.py    # Vector DB client
│       │   │   ├── object_store.py   # S3/MinIO
│       │   │   └── sse.py       # SSE response helper
│       │   ├── llm/             # LLM providers
│       │   │   ├── base.py      # Abstract LLMProvider
│       │   │   ├── ollama.py    # Local Ollama
│       │   │   ├── openai.py    # OpenAI API
│       │   │   ├── anthropic.py # Anthropic API
│       │   │   └── provider_factory.py
│       │   ├── mcp/             # MCP tool registry + sidecars
│       │   │   ├── service.py   # Registry singleton
│       │   │   ├── registry.py  # Server config, lazy clients
│       │   │   ├── sdk_client.py    # MCP protocol client
│       │   │   ├── tool_adapter.py  # MCP → OpenAI format
│       │   │   └── sidecar.py   # Docker sidecar manager
│       │   ├── memory/          # Memory system (fact extraction)
│       │   ├── pipeline/        # Memory pipeline handlers
│       │   ├── rag/             # RAG pipeline
│       │   │   ├── processor.py # Ingest: extract → chunk → embed → store
│       │   │   ├── chunker.py   # 4 strategies (recursive, token, parent-child, semantic)
│       │   │   ├── retriever.py # Hybrid search (dense + BM25)
│       │   │   ├── vector_store.py  # Qdrant integration
│       │   │   └── reranker.py  # Cross-encoder / Cohere reranking
│       │   ├── sync/            # Platform sync (pull-based polling)
│       │   ├── supervisor/      # Hierarchical agent routing
│       │   ├── gateway/         # Gateway tool executor
│       │   ├── domain_config/   # ConfigProvider (DB-backed)
│       │   ├── worker/          # Background task processing
│       │   │   ├── runner.py    # Entry point (streams + scheduler)
│       │   │   ├── tasks.py     # Task handlers
│       │   │   └── scheduler.py # APScheduler config
│       │   └── models/          # Model discovery + usage tracking
│       ├── alembic/             # Database migrations
│       ├── pyproject.toml
│       └── Dockerfile
│
├── gateway/                     # Secure system access for agents
│   ├── src/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Settings
│   │   ├── router.py            # Tool execution endpoints
│   │   ├── permission_engine.py # Permission checks
│   │   ├── executors/           # Browser, network, filesystem, shell
│   │   ├── approval/            # Human-in-the-loop approval workflow
│   │   ├── audit/               # Audit logging
│   │   ├── sandbox/             # Docker sandbox manager
│   │   └── infra/               # DB, Redis, middleware, metrics
│   ├── pyproject.toml
│   └── Dockerfile
│
├── platform/                    # Next.js 16 — admin + studio + marketing
│   ├── src/
│   │   ├── app/
│   │   │   ├── (admin)/         # Client/engine management
│   │   │   ├── (studio)/        # Agent/graph editor, releases
│   │   │   ├── (marketing)/     # Landing, features, pricing
│   │   │   ├── (auth)/          # Login, register
│   │   │   └── api/             # API routes (sync, engine proxy)
│   │   ├── components/          # SessionProvider, page components
│   │   ├── hooks/               # useChatConfig, useChat
│   │   ├── lib/                 # auth.ts, db.ts, engine-proxy.ts
│   │   └── stores/              # Zustand (agents, clients, engines)
│   ├── prisma/schema.prisma     # User, Client, Engine, Agent, Graph
│   └── Dockerfile
│
├── shared/                      # modularmind_shared — Python shared schemas
│   └── src/modularmind_shared/
│
├── docker/                      # Docker Compose + Nginx configs
│   ├── docker-compose.yml       # Production client (7 containers)
│   ├── docker-compose.dev.yml   # Development (8 containers)
│   ├── docker-compose.platform.yml  # Platform (3 containers)
│   ├── docker-compose.monitoring.yml # Prometheus + Grafana
│   └── nginx/
│       ├── Dockerfile           # Multi-stage SPA builder
│       ├── client.conf          # Client reverse proxy
│       └── platform.conf        # Platform reverse proxy
│
├── monitoring/                  # Prometheus + Grafana configs
│   ├── prometheus/prometheus.yml
│   └── grafana/
│       ├── dashboards/          # Pre-built dashboards
│       └── provisioning/        # Datasources + dashboard config
│
├── Makefile                     # All dev/build/deploy commands
├── pnpm-workspace.yaml          # Monorepo workspace config
├── turbo.json                   # Turborepo build orchestration
└── .github/workflows/           # CI/CD pipelines
    ├── ci.yml
    └── deploy.yml
```

---

## System Architecture

### Service Map

```
                            Internet
                               │
                               ▼
                    ┌─────────────────────┐
                    │       Nginx         │  :80 / :443
                    │   Reverse Proxy     │
                    │  + Static SPA Host  │
                    └─────┬─────┬────┬────┘
                          │     │    │
                ┌─────────┘     │    └─────────┐
                ▼               ▼              ▼
         ┌────────────┐  ┌──────────┐   ┌──────────┐
         │ Chat SPA   │  │ Ops SPA  │   │ /api/*   │
         │ /          │  │ /ops/*   │   │ Proxy    │
         │ (static)   │  │ (static) │   │          │
         └────────────┘  └──────────┘   └─────┬────┘
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐    ┌──────────────┐
                   │   Engine    │    │   Worker     │    │   Gateway    │
                   │   :8000     │    │  (no port)   │    │   :8200      │
                   │             │    │              │    │              │
                   │ REST API    │    │ Redis Stream │    │ Sandboxed    │
                   │ SSE Stream  │    │ Consumer     │    │ Tool Exec    │
                   │ Auth/CORS   │    │ APScheduler  │    │ Approval     │
                   └──────┬──────┘    └──────┬───────┘    └──────┬───────┘
                          │                  │                   │
         ┌────────────────┼──────────────────┼───────────────────┘
         │                │                  │
         ▼                ▼                  ▼
  ┌─────────────────────────────────────────────────────────┐
  │                   Infrastructure                        │
  │                                                         │
  │  ┌──────────┐  ┌───────┐  ┌────────┐  ┌──────┐        │
  │  │PostgreSQL│  │ Redis │  │ Qdrant │  │MinIO │        │
  │  │  :5432   │  │ :6379 │  │ :6333  │  │:9000 │        │
  │  │          │  │       │  │        │  │      │        │
  │  │ Data +   │  │Streams│  │Vectors │  │Files │        │
  │  │ Config   │  │+Cache │  │ (RAG)  │  │ (S3) │        │
  │  └──────────┘  └───────┘  └────────┘  └──────┘        │
  │                                                         │
  │  ┌────────────────────────────────────────────────┐     │
  │  │           LLM Providers                        │     │
  │  │  ┌────────┐  ┌────────┐  ┌──────────┐         │     │
  │  │  │ Ollama │  │ OpenAI │  │Anthropic │  ...    │     │
  │  │  │ :11434 │  │  API   │  │   API    │         │     │
  │  │  └────────┘  └────────┘  └──────────┘         │     │
  │  └────────────────────────────────────────────────┘     │
  └─────────────────────────────────────────────────────────┘
```

---

## Core Systems

### Execution Flow

This is the core flow when a user sends a message to an agent:

```
  User types message
         │
         ▼
  ┌─────────────┐     POST /agents/:id/execute
  │  Chat App   │ ──────────────────────────────────┐
  │  (React)    │                                    │
  └──────┬──────┘                                    ▼
         │                                   ┌──────────────┐
         │                                   │  Engine API  │
         │                                   │              │
         │                                   │ 1. Validate  │
         │                                   │ 2. Create    │
         │                                   │    Execution │
         │                                   │    (PENDING) │
         │                                   │ 3. Publish   │
         │                                   │    to Redis  │
         │                                   │    Stream    │
         │                                   └──────┬───────┘
         │                                          │
         │                              XADD tasks:executions
         │                                          │
         │                                          ▼
         │                                   ┌──────────────┐
         │                                   │   Worker     │
         │                                   │              │
         │     EventSource                   │ 4. Pick up   │
         │     /executions/:id/stream        │    task       │
         │◄──────────────────────────────────│ 5. Compile   │
         │                                   │    graph     │
         │     event: token                  │ 6. Execute   │
         │     data: {"content":"Hi"}        │    nodes     │
         │◄──────────────────────────────────│ 7. Stream    │
         │                                   │    events    │
         │     event: trace                  │ 8. Persist   │
         │     data: {"tool":"search"...}    │    result    │
         │◄──────────────────────────────────│              │
         │                                   └──────────────┘
         │     event: complete
         │     data: {"status":"success"}
         │◄──────────────────────────────────
         │
         ▼
  Message displayed
```

**Steps:**
1. Client sends `POST /api/v1/agents/:id/execute` with prompt + context
2. Engine creates `ExecutionRun` in DB (status: PENDING)
3. Engine publishes task to Redis Stream `tasks:executions`
4. Worker picks up the task via `XREADGROUP`
5. `GraphCompiler` compiles the agent's graph config into a LangGraph `StateGraph`
6. Graph executes: LLM calls, tool loops, condition branches
7. Events stream to `exec_stream:{id}` Redis Stream (token, trace, step, complete, error)
8. Client reads events via SSE (`EventSource`) and renders in real-time

---

### Graph Engine

The graph engine compiles declarative graph configurations into executable LangGraph state machines.

```
  Graph Config (JSON)                 Compiled LangGraph
  ┌──────────────────┐               ┌──────────────────────────┐
  │                  │               │                          │
  │  nodes:          │    Compile    │  START                   │
  │  ┌──────────┐   │   ────────►   │    │                     │
  │  │ agent_1  │   │               │    ▼                     │
  │  │ agent_2  │   │               │  ┌──────────┐            │
  │  │ condition│   │               │  │ agent_1  │            │
  │  │ tool     │   │               │  │ (LLM +   │            │
  │  └──────────┘   │               │  │  tools)  │            │
  │                  │               │  └────┬─────┘            │
  │  edges:          │               │       │                  │
  │  agent_1→cond   │               │       ▼                  │
  │  cond→agent_2   │               │  ┌──────────┐            │
  │  cond→tool      │               │  │condition │            │
  │                  │               │  └──┬────┬──┘            │
  └──────────────────┘               │     │    │               │
                                     │     ▼    ▼               │
                                     │  agent_2  tool           │
                                     │     │      │             │
                                     │     └──┬───┘             │
                                     │        ▼                 │
                                     │      END                 │
                                     └──────────────────────────┘
```

**Node Types:**

| Node Type | Description |
|-----------|-------------|
| **Agent** | Calls LLM with system prompt + tools (ReAct tool-calling loop) |
| **Tool** | Executes a specific MCP or built-in tool |
| **Condition** | Branches based on state expressions |
| **Parallel** | Executes multiple branches concurrently |
| **Merge** | Combines results from parallel branches |
| **Loop** | Iterates with counter or condition |
| **Subgraph** | Recursively invokes another graph |

**GraphState (TypedDict):**

```python
class GraphState(TypedDict):
    messages: list[BaseMessage]      # Conversation history
    input_prompt: str                # User's input
    input_data: dict                 # Additional context
    current_node: str                # Currently executing node
    node_outputs: dict               # node_id → output mapping
    should_interrupt: bool           # Pause flag
    error: str | None                # Error message
    metadata: dict                   # Execution metadata
    branch_results: dict             # Parallel branch outputs
    loop_state: dict                 # Loop counter/condition
```

---

### Worker & Redis Streams

The worker is a single process (no Celery) that consumes from Redis Streams and runs scheduled jobs.

```
  ┌──────────────────────────────────────────────────────────┐
  │                       Worker Process                      │
  │                                                          │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │              Redis Stream Consumers                │  │
  │  │                                                    │  │
  │  │  tasks:executions ──► graph_execution_handler      │  │
  │  │  tasks:models     ──► model_pull_handler           │  │
  │  │  tasks:documents  ──► document_process_handler     │  │
  │  │  memory:raw       ──► extractor_handler            │  │
  │  │  memory:extracted ──► embedder_handler             │  │
  │  │                                                    │  │
  │  │  Consumer Group: XREADGROUP with ack/retry/DLQ     │  │
  │  └────────────────────────────────────────────────────┘  │
  │                                                          │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │              APScheduler (Periodic Jobs)           │  │
  │  │                                                    │  │
  │  │  Every 5min  ──► Platform sync (pull config)       │  │
  │  │  Every 6h    ──► Memory consolidation              │  │
  │  │  Every 24h   ──► Profile synthesis                 │  │
  │  │  Periodic    ──► RAG consolidation                 │  │
  │  └────────────────────────────────────────────────────┘  │
  │                                                          │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │          TCP Health Server (:8001)                  │  │
  │  │          Docker healthcheck endpoint               │  │
  │  └────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────┘
```

**Stream Processing:**
- Consumer groups with `XREADGROUP` for at-least-once delivery
- Exponential backoff (1s → 30s) on connection loss
- 3 retries per message, then moved to DLQ (`pipeline:dlq`)
- Messages acknowledged after successful processing

---

### RAG Pipeline

Full document ingestion and retrieval pipeline:

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    RAG Ingestion Pipeline                    │
  │                                                             │
  │  Upload               Extract              Chunk            │
  │  ┌──────┐           ┌──────────┐        ┌──────────────┐   │
  │  │ PDF  │           │ pypdf /  │        │  Strategy:   │   │
  │  │ DOCX │──► S3 ──►│ docx /   │──────►│  • Recursive │   │
  │  │ TXT  │   MinIO   │ raw text │        │  • Token     │   │
  │  │ MD   │           └──────────┘        │  • Parent-   │   │
  │  └──────┘                               │    Child     │   │
  │                                         │  • Semantic  │   │
  │                                         └──────┬───────┘   │
  │                                                │            │
  │                    Embed                   Store             │
  │                 ┌──────────┐          ┌──────────────┐      │
  │                 │ nomic-   │          │              │      │
  │            ──►  │ embed-   │────────►│   Qdrant     │      │
  │                 │ text     │          │   + PG       │      │
  │                 │ (batch)  │          │   metadata   │      │
  │                 └──────────┘          └──────────────┘      │
  └─────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────┐
  │                    RAG Retrieval Pipeline                    │
  │                                                             │
  │  Query              Search              Rerank              │
  │  ┌──────────┐    ┌──────────────┐    ┌──────────────┐      │
  │  │ "What is │    │  Hybrid:     │    │  Optional:   │      │
  │  │  the..." │──►│  Dense +     │──►│  • Cohere    │      │
  │  │          │    │  BM25 Sparse │    │  • Cross-    │      │
  │  └──────────┘    │              │    │    encoder   │      │
  │                  │  + ACL       │    └──────┬───────┘      │
  │                  │    filters   │           │               │
  │                  └──────────────┘           ▼               │
  │                                      ┌──────────────┐      │
  │                                      │  Formatted   │      │
  │                                      │  context →   │      │
  │                                      │  system      │      │
  │                                      │  prompt      │      │
  │                                      └──────────────┘      │
  └─────────────────────────────────────────────────────────────┘
```

**Chunking Strategies:**

| Strategy | Description |
|----------|-------------|
| **Recursive** | Character-based splitting with overlap |
| **Token-Aware** | Uses tiktoken (cl100k_base) for precise token counts |
| **Parent-Child** | Hierarchical — small children for retrieval, large parents for context |
| **Semantic** | Groups sentences by embedding similarity (NLTK) |

**Access Control:**
- Qdrant payloads include: `scope` (global/user/agent), `group_slugs`, `user_id`
- Double-gate filtering: scope check + group membership check

---

### Memory Pipeline

Automatic fact extraction from conversations:

```
  Conversation
  completes
      │
      ▼
  ┌──────────┐    memory:raw     ┌──────────────┐    memory:extracted    ┌──────────────┐
  │ Raw text │ ─────────────────►│  Extractor   │ ──────────────────────►│  Embedder    │
  │ emitted  │    Redis Stream   │              │      Redis Stream      │              │
  └──────────┘                   │ LLM extracts │                       │ Generates    │
                                 │ structured   │                       │ vectors,     │
                                 │ facts        │                       │ stores in    │
                                 └──────────────┘                       │ Qdrant + PG  │
                                                                        └──────────────┘
```

**Storage:**
- PostgreSQL: `memory_fact`, `memory_edge` tables
- Qdrant: Vectors in global collection for similarity search

---

### MCP Tools

Model Context Protocol integration for extensible tool execution:

```
  ┌──────────────────────────────────────────────────────────────┐
  │                      MCP Registry                            │
  │                                                              │
  │  ┌────────────────┐   ┌────────────────┐                    │
  │  │  HTTP Servers   │   │ STDIO Servers  │                    │
  │  │                 │   │                │                    │
  │  │  Brave Search   │   │  Local CLI     │                    │
  │  │  DuckDuckGo     │   │  tools         │                    │
  │  │  Custom APIs    │   │                │                    │
  │  └────────┬────────┘   └────────┬───────┘                   │
  │           │                     │                            │
  │           └─────────┬───────────┘                            │
  │                     ▼                                        │
  │            ┌────────────────┐                                │
  │            │   MCPClient    │     Tool cache (60s TTL)       │
  │            │   per server   │     Lazy init with locks       │
  │            │                │     Health check loop          │
  │            └────────┬───────┘                                │
  │                     │                                        │
  │                     ▼                                        │
  │            ┌────────────────┐                                │
  │            │  Tool Adapter  │     MCP → OpenAI function      │
  │            │  (format      │     format conversion           │
  │            │   conversion) │                                 │
  │            └────────────────┘                                │
  │                                                              │
  │  ┌─────────────────────────────────────────┐                 │
  │  │          Sidecar Manager                │                 │
  │  │                                         │                 │
  │  │  Deploys Docker containers for:         │                 │
  │  │  • Brave Search  • DuckDuckGo           │                 │
  │  │  • Qdrant        • MotherDuck           │                 │
  │  │  • Puppeteer     • WhatsApp             │                 │
  │  │  • Node Proxy                           │                 │
  │  │                                         │                 │
  │  │  Auto-recovery on restart               │                 │
  │  └─────────────────────────────────────────┘                 │
  └──────────────────────────────────────────────────────────────┘
```

**Bootstrap:** Set `MCP_BOOTSTRAP_SERVERS="Name|URL,Name2|URL2"` env var to auto-register HTTP MCP servers at startup.

---

### LLM Providers

Multi-provider architecture with factory pattern:

```
  ┌──────────────────────────────────────────────────────┐
  │                 Provider Factory                      │
  │                                                      │
  │   LLM_PROVIDER env var                               │
  │        │                                             │
  │        ├──► "ollama"    ──► OllamaProvider           │
  │        │                    ChatOllama (LangChain)   │
  │        │                    localhost:11434           │
  │        │                                             │
  │        ├──► "openai"    ──► OpenAIProvider            │
  │        │                    ChatOpenAI               │
  │        │                    api.openai.com           │
  │        │                                             │
  │        ├──► "anthropic" ──► AnthropicProvider         │
  │        │                    ChatAnthropic            │
  │        │                    api.anthropic.com        │
  │        │                                             │
  │        ├──► "vllm"      ──► VLLMProvider              │
  │        │                    OpenAI-compatible        │
  │        │                                             │
  │        ├──► "tgi"       ──► TGIProvider               │
  │        │                    OpenAI-compatible        │
  │        │                                             │
  │        └──► "auto"      ──► Auto-detect (GPU-aware)  │
  │                             vLLM > TGI > Ollama      │
  └──────────────────────────────────────────────────────┘
```

**Model Resolution:** IDs follow `provider:model` format (e.g., `ollama:llama3.2`, `openai:gpt-4o`, `anthropic:claude-sonnet-4-20250514`)

---

### SSE Streaming

Server-Sent Events for real-time communication (no WebSocket):

```
  Client (EventSource)                    Engine
  ─────────────────────                   ──────
       │
       │  GET /executions/:id/stream
       │  Accept: text/event-stream
       │──────────────────────────────────►│
       │                                   │
       │◄──────────────────────────────────│  event: token
       │  data: {"type":"token",           │  id: 1
       │         "content":"Hello"}        │
       │                                   │
       │◄──────────────────────────────────│  event: trace
       │  data: {"type":"trace:tool_start",│  id: 2
       │         "tool_name":"search"}     │
       │                                   │
       │◄──────────────────────────────────│  event: trace
       │  data: {"type":"trace:tool_end",  │  id: 3
       │         "result":"..."}           │
       │                                   │
       │◄──────────────────────────────────│  event: complete
       │  data: {"type":"complete",        │  id: 4
       │         "status":"success"}       │
       │                                   │
       ▼                                   ▼
```

**Event Types:**
- `token` — LLM output tokens (streamed content)
- `trace` — Tool calls, LLM starts, routing decisions
- `step` — Node transitions in graph execution
- `complete` — Execution finished successfully
- `error` — Execution failed

**Config:** Keepalive interval 15s, message buffer TTL 60s.

---

### Gateway & Sandbox

Secure system-level tool execution for AI agents:

```
  ┌──────────────────────────────────────────────────────────────┐
  │                        Gateway :8200                          │
  │                                                              │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │                   Permission Engine                     │  │
  │  │  Agent config defines allowed actions:                  │  │
  │  │  • filesystem: read/write paths, allowed extensions     │  │
  │  │  • shell: allowed commands, timeout                     │  │
  │  │  • browser: allowed domains, screenshot                 │  │
  │  │  • network: allowed hosts, methods                      │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                          │                                   │
  │                          ▼                                   │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │                   Approval Engine                       │  │
  │  │  High-risk actions require human approval:              │  │
  │  │  • SSE event sent to client                             │  │
  │  │  • User approves/denies in chat UI                      │  │
  │  │  • 5 min timeout                                        │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                          │                                   │
  │                          ▼                                   │
  │  ┌──────────────────┐  ┌──────────────────┐                 │
  │  │   Executors      │  │  Sandbox Manager │                 │
  │  │                  │  │                  │                  │
  │  │  • Browser       │  │  Docker          │                 │
  │  │  • Network       │  │  containers      │                 │
  │  │  • Filesystem    │  │  with resource   │                 │
  │  │  • Shell         │  │  limits          │                 │
  │  └──────────────────┘  └──────────────────┘                 │
  │                                                              │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │                   Audit Logger                          │  │
  │  │  Every tool execution is logged with full context       │  │
  │  └────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘
```

**Sandbox:** Docker containers (`modularmind/gateway-sandbox`) with:
- Isolated filesystem (per-agent workspaces)
- Resource limits (CPU, memory)
- 5-minute default timeout
- Max 20 concurrent sandboxes
- Automatic cleanup (every 60s)

---

## Frontend Architecture

### Chat App

The user-facing chat application built with Vite + React.

```
  ┌──────────────────────────────────────────────────────────┐
  │                     Chat App (/)                          │
  │                                                          │
  │  ┌─────────────┐  ┌──────────────────────────────────┐  │
  │  │ Conversation│  │          Chat Area               │  │
  │  │  Sidebar    │  │                                  │  │
  │  │             │  │  ┌────────────────────────────┐  │  │
  │  │  • List     │  │  │     Messages              │  │  │
  │  │  • Search   │  │  │     (streaming via SSE)   │  │  │
  │  │  • New      │  │  │                           │  │  │
  │  │             │  │  │  User: "Hello..."         │  │  │
  │  │             │  │  │  Agent: "Hi! I can..."    │  │  │
  │  │             │  │  │  [tool: web_search ✓]     │  │  │
  │  │             │  │  │  Agent: "Based on..."     │  │  │
  │  │             │  │  └────────────────────────────┘  │  │
  │  │             │  │                                  │  │
  │  │             │  │  ┌────────────────────────────┐  │  │
  │  │             │  │  │  Chat Input               │  │  │
  │  │             │  │  │  [📎] [Type message...] [→]│  │  │
  │  │             │  │  │  Attachments: 25MB max    │  │  │
  │  │             │  │  └────────────────────────────┘  │  │
  │  └─────────────┘  └──────────────────────────────────┘  │
  │                                                          │
  │                   ┌──────────────────────┐               │
  │                   │   Insights Panel     │               │
  │                   │                      │               │
  │                   │  Config │ Memory     │               │
  │                   │  Context│ Activities │               │
  │                   └──────────────────────┘               │
  └──────────────────────────────────────────────────────────┘
```

**Key Hooks:**
- `useChat()` — SSE streaming, message handling, file uploads
- `useConversations()` — CRUD operations for conversations
- `useChatConfig()` — Loads agents, graphs, models, MCP servers
- `useInsightsPanel()` — Right panel state management

### Ops App

Admin console for monitoring and configuration (at `/ops`):

```
  ┌──────────────────────────────────────────────────┐
  │                  Ops App (/ops)                    │
  │                                                    │
  │  ┌─────────┐  ┌────────────────────────────────┐  │
  │  │  Nav    │  │  Pages:                         │  │
  │  │         │  │                                 │  │
  │  │ Dashboard│  │  • Dashboard — System overview  │  │
  │  │ Monitor │  │  • Monitoring — GPU, pipelines  │  │
  │  │ Config  │  │  • Configuration — Embeddings,  │  │
  │  │ Models  │  │    MCP, providers, system       │  │
  │  │ Knowledge│ │  • Models — LLM catalog + CRUD  │  │
  │  │ Users   │  │  • Knowledge — Collections,     │  │
  │  │ Settings│  │    graphs (Sigma.js)            │  │
  │  │         │  │  • Users — Role management      │  │
  │  └─────────┘  └────────────────────────────────┘  │
  └──────────────────────────────────────────────────┘
```

### Platform

Next.js 16 full-stack app for multi-tenant management:

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    Platform (Next.js)                          │
  │                                                               │
  │  Route Groups:                                                │
  │                                                               │
  │  (marketing)          (auth)            (admin)               │
  │  ┌──────────┐        ┌──────────┐      ┌──────────────┐      │
  │  │ Landing  │        │ Login    │      │ Dashboard    │      │
  │  │ Features │        │ Register │      │ Clients      │      │
  │  │ Pricing  │        └──────────┘      │ Engines      │      │
  │  └──────────┘                          │ Settings     │      │
  │                                        └──────────────┘      │
  │                                                               │
  │  (studio)                              API Routes             │
  │  ┌──────────────┐                     ┌──────────────────┐   │
  │  │ Agents       │                     │ /api/sync/*      │   │
  │  │  └─ Editor   │                     │ /api/chat/*      │   │
  │  │  └─ Config   │                     │ /api/agents/*    │   │
  │  │  └─ Perms    │                     │ /api/engines/*   │   │
  │  │ Graphs       │                     │ /api/reports/*   │   │
  │  │  └─ Visual   │                     │                  │   │
  │  │     Editor   │                     │ Proxy → Engine   │   │
  │  │ Chat (embed) │                     │ (HMAC auth)      │   │
  │  │ Releases     │                     └──────────────────┘   │
  │  └──────────────┘                                             │
  │                                                               │
  │  Prisma Schema:  User, Client, Engine, Agent, Graph           │
  └──────────────────────────────────────────────────────────────┘
```

**Config Sync:** Engine pulls config from Platform via polling:

```
  Platform                              Engine
  ────────                              ──────
      │                                    │
      │  GET /api/sync/manifest            │
      │◄───────────────────────────────────│  (every 5 min)
      │  X-Engine-Key: <api-key>           │
      │                                    │
      │  Response: {agents, graphs,        │
      │    models, hashes}                 │
      │────────────────────────────────────►│
      │                                    │
      │  GET /api/sync/agents/:id          │  (if hash changed)
      │◄───────────────────────────────────│
      │  Full agent config                 │
      │────────────────────────────────────►│
      │                                    │  Store in DB
```

### Shared UI Library

`@modularmind/ui` — 60+ components shared across all 3 apps:

```
  @modularmind/ui
  │
  ├── Theme System
  │   ├── theme.css          # CSS variables (HSL, :root + .dark)
  │   ├── ThemeProvider      # Mode, accent, presets (React context)
  │   ├── Anti-FOUC script   # Prevents theme flash on load
  │   └── 5 presets          # Violet, Ocean, Forest, Sunset, Rose
  │
  ├── Primitives (shadcn/ui)
  │   ├── Button, Badge, Card, Dialog, Input
  │   ├── Select, Tabs, Textarea, Switch, Slider
  │   ├── Popover, Tooltip, DropdownMenu
  │   └── Separator, ScrollArea, Skeleton
  │
  ├── Domain Components
  │   ├── Chat:  ChatMessages, ChatInput, ChatPanel
  │   ├── Activity:  ExecutionActivityList, Timeline
  │   ├── Insights:  InsightsPanel (Config/Memory/Context)
  │   └── Auth:  LoginForm, UserButton
  │
  ├── Layout
  │   ├── PageHeader, DetailHeader
  │   ├── ResourceTable, ResourceFilters
  │   ├── ErrorBoundary, EmptyState
  │   └── RouteLoader
  │
  ├── Hooks
  │   ├── useAuth()
  │   └── useExecutionActivities()
  │
  └── Constants
      ├── ACTIVITY_COLORS, STATUS_COLORS
      ├── CHANNEL_COLORS, ROLE_COLORS
      └── HEALTH_COLORS
```

### API Client

`@modularmind/api-client` — typed HTTP client with automatic auth:

```
  ┌────────────────────────────────────────────────────┐
  │              @modularmind/api-client                │
  │                                                    │
  │  Request Flow:                                     │
  │                                                    │
  │  api.get("/path")                                  │
  │       │                                            │
  │       ▼                                            │
  │  credentials: "include"  ◄── HttpOnly cookie auth  │
  │       │                                            │
  │       ▼                                            │
  │  Fetch request                                     │
  │       │                                            │
  │       ├── 200 OK ──► Return typed response         │
  │       │                                            │
  │       ├── 401 ──► Refresh token (mutex lock)       │
  │       │           POST /auth/refresh               │
  │       │           ├── Success ──► Retry request     │
  │       │           └── Failure ──► auth:expired      │
  │       │                          event dispatched   │
  │       │                                            │
  │       └── Error ──► Throw with message             │
  │                                                    │
  │  Features:                                         │
  │  • Typed responses (generics)                      │
  │  • snake_case ↔ camelCase auto-conversion          │
  │  • FormData support for file uploads               │
  │  • Concurrent refresh prevention (mutex)           │
  └────────────────────────────────────────────────────┘
```

---

## Authentication

Two auth systems for different deployment contexts:

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  Authentication Architecture                 │
  │                                                             │
  │  Chat / Ops (Direct to Engine)       Platform (Next.js)     │
  │  ────────────────────────────        ──────────────────     │
  │                                                             │
  │  POST /api/v1/auth/login             NextAuth v5            │
  │       │                              Credentials provider   │
  │       ▼                                   │                 │
  │  Engine validates                    bcrypt verify          │
  │  credentials                              │                 │
  │       │                                   ▼                 │
  │       ▼                              JWT session            │
  │  Set HttpOnly cookies                (1h sliding,           │
  │  • access_token                       7d hard expiry)       │
  │  • refresh_token                          │                 │
  │       │                                   ▼                 │
  │       ▼                              Session cookie         │
  │  API Client auto-includes                                   │
  │  credentials: "include"                                     │
  │       │                              API routes proxy       │
  │       ▼                              to Engine with         │
  │  401 → auto-refresh                  HMAC-SHA256 token      │
  │  via /auth/refresh                   + X-Platform-User-     │
  │                                        Email header         │
  └─────────────────────────────────────────────────────────────┘
```

---

## Deployment

### Client Stack (7+ containers)

```bash
make deploy  # or: docker compose -f docker/docker-compose.yml up -d
```

```
  ┌─────────────────────────────────────────────────────────┐
  │               Client Deployment Stack                    │
  │                                                         │
  │  ┌──────────────────────────────────────────┐           │
  │  │              Nginx :80/:443              │           │
  │  │  / ──────────► Chat SPA (baked in)       │           │
  │  │  /ops/* ─────► Ops SPA (baked in)        │           │
  │  │  /api/* ─────► Engine :8000              │           │
  │  │  /gateway/* ─► Gateway :8200             │           │
  │  └──────────────────────────────────────────┘           │
  │                                                         │
  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐  │
  │  │  Engine    │ │  Worker    │ │  Gateway (optional) │  │
  │  │  :8000     │ │  :8001     │ │  :8200              │  │
  │  │  4 workers │ │  health    │ │  1 worker (critical)│  │
  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────────────┘  │
  │        │              │              │                  │
  │  ┌─────┴──────────────┴──────────────┴───────────────┐  │
  │  │                Infrastructure                      │  │
  │  │  PostgreSQL :5432  │  Redis :6379  │  Qdrant :6333 │  │
  │  │  MinIO :9000       │  Ollama :11434 (optional)     │  │
  │  └───────────────────────────────────────────────────┘  │
  │                                                         │
  │  Volumes: postgres-data, redis-data, qdrant-data,       │
  │           minio-data, ollama-data, gateway-workspaces   │
  └─────────────────────────────────────────────────────────┘
```

### Platform Stack (3 containers)

```bash
make deploy-platform  # or: docker compose -f docker/docker-compose.platform.yml up -d
```

```
  ┌──────────────────────────────────────────┐
  │          Platform Deployment              │
  │                                          │
  │  ┌────────────┐    ┌────────────────┐   │
  │  │   Nginx    │───►│   Platform     │   │
  │  │  :80/:443  │    │   :3000        │   │
  │  └────────────┘    │   (Next.js)    │   │
  │                    └────────┬───────┘   │
  │                             │            │
  │                    ┌────────┴───────┐   │
  │                    │  PostgreSQL    │   │
  │                    │  :5432         │   │
  │                    │  (platform DB) │   │
  │                    └────────────────┘   │
  └──────────────────────────────────────────┘
```

### Monitoring Stack

```bash
make dev-monitoring  # or: docker compose -f docker/docker-compose.monitoring.yml up
```

```
  ┌──────────────────────────────────────────────────────┐
  │               Monitoring Stack                        │
  │                                                      │
  │  ┌────────────┐    ┌─────────────────┐              │
  │  │  Grafana   │◄───│   Prometheus    │              │
  │  │  :3333     │    │   :9090         │              │
  │  │            │    │                 │              │
  │  │ Dashboards:│    │ Scrapes:        │              │
  │  │ • Overview │    │ • Engine /metrics│              │
  │  │ • Engine   │    │ • Node Exporter │              │
  │  │ • Execs    │    │ • cAdvisor      │              │
  │  │ • LLM      │    │ • PG Exporter   │              │
  │  │ • PG       │    │ • Redis Exporter│              │
  │  │ • Redis    │    └─────────────────┘              │
  │  └────────────┘                                     │
  │                                                      │
  │  ┌──────────────┐ ┌──────────┐ ┌──────────────────┐ │
  │  │Node Exporter │ │ cAdvisor │ │ PG/Redis Exporter│ │
  │  │(host metrics)│ │(Docker)  │ │  (DB metrics)    │ │
  │  └──────────────┘ └──────────┘ └──────────────────┘ │
  └──────────────────────────────────────────────────────┘
```

---

## Development

### Prerequisites

- **Node.js** 22+
- **pnpm** 9.15+
- **Python** 3.12+
- **Docker** & Docker Compose
- **Make**

### Quick Start

```bash
# 1. Clone and setup
git clone <repo-url>
cd ModularMind-V2
make setup              # Install all dependencies, copy .env

# 2. Configure environment
cp .env.example .env    # Edit with your settings

# 3. Start infrastructure
make dev-infra          # PostgreSQL, Redis, Qdrant, MinIO

# 4. Run migrations
make migrate            # Alembic migrations (Engine DB)
make db-push            # Prisma schema push (Platform DB)

# 5. Start services (in separate terminals)
make dev-engine         # Engine API on :8000
make dev-worker         # Worker (Redis Streams + scheduler)
make dev-chat           # Chat app on :3002
make dev-ops            # Ops app on :3003
make dev-platform       # Platform on :3000

# Or start everything at once:
make dev                # All services via Docker Compose
```

### Commands

| Command | Description |
|---------|-------------|
| `make setup` | Install all deps (pnpm + pip), copy .env |
| `make dev` | Start all services (Docker Compose) |
| `make dev-infra` | Start infra only (db, redis, qdrant, minio) |
| `make dev-engine` | Start Engine (uvicorn --reload, :8000) |
| `make dev-worker` | Start Worker (Redis Streams + APScheduler) |
| `make dev-gateway` | Start Gateway (uvicorn --reload, :8200) |
| `make dev-chat` | Start Chat app (Vite dev, :3002) |
| `make dev-ops` | Start Ops app (Vite dev, :3003) |
| `make dev-platform` | Start Platform (Next.js dev, :3000) |
| `make dev-monitoring` | Start Prometheus + Grafana |
| `make build` | Build all apps (turbo) |
| `make build-docker` | Build Docker images (client stack) |
| `make build-platform` | Build Platform Docker image |
| `make build-gateway` | Build Gateway Docker image |
| `make build-mcp-sidecars` | Build MCP sidecar Docker images |
| `make deploy` | Deploy client stack |
| `make deploy-platform` | Deploy platform stack |
| `make test` | Run Python tests (shared + engine) |
| `make test-cov` | Run tests with coverage report |
| `make lint` | Run all linters (ruff + turbo lint) |
| `make lint-fix` | Auto-fix lint issues |
| `make migrate` | Run Alembic migrations |
| `make migrate-new` | Create new auto-generated migration |
| `make db-push` | Push Prisma schema to Platform DB |

---

## CI/CD

GitHub Actions with two workflows:

```
  ┌─────────────────────────────────────────────────────────┐
  │                    CI Pipeline (ci.yml)                   │
  │                    Trigger: PR to main                    │
  │                                                          │
  │  ┌──────┐  ┌─────────────┐  ┌──────────────┐  ┌──────┐ │
  │  │ Lint │  │ Test Python │  │ Test TypeScript│  │Build │ │
  │  │      │  │             │  │              │  │Check │ │
  │  │ruff  │  │pytest +     │  │pnpm test     │  │      │ │
  │  │turbo │  │coverage     │  │+ coverage    │  │pnpm  │ │
  │  │lint  │  │ratchet      │  │ratchet       │  │build │ │
  │  └──────┘  └─────────────┘  └──────────────┘  └──────┘ │
  └─────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │                  Deploy Pipeline (deploy.yml)             │
  │                  Trigger: Push to main                    │
  │                                                          │
  │  CI Gates (lint, test, build)                             │
  │       │                                                  │
  │       ▼                                                  │
  │  ┌──────────────────┐                                    │
  │  │  Build Images    │  Matrix: engine, nginx, platform   │
  │  │  Push to GHCR    │  Tags: :latest, :sha-{sha}        │
  │  └────────┬─────────┘                                    │
  │           │                                              │
  │           ▼                                              │
  │  ┌──────────────────┐                                    │
  │  │  Deploy to VPS   │  SSH → git pull → docker pull      │
  │  │                  │  → run migrations → docker up      │
  │  │                  │  → health checks                   │
  │  └──────────────────┘                                    │
  └─────────────────────────────────────────────────────────┘
```

---

## Environment Variables

### Core
| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | (required) |
| `ENVIRONMENT` | `development` or `production` | `development` |

### Database
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | (required) |
| `DB_USER` | Database user | `modularmind` |
| `DB_PASSWORD` | Database password | `modularmind` |

### Services
| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `QDRANT_URL` | Qdrant HTTP endpoint | `http://localhost:6333` |
| `OLLAMA_BASE_URL` | Ollama API endpoint | `http://localhost:11434` |
| `S3_ENDPOINT` | MinIO/S3 endpoint | `http://localhost:9000` |

### LLM Providers
| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | Provider selection | `ollama` |
| `OPENAI_API_KEY` | OpenAI API key | (optional) |
| `ANTHROPIC_API_KEY` | Anthropic API key | (optional) |

### Platform Sync
| Variable | Description | Default |
|----------|-------------|---------|
| `PLATFORM_URL` | Platform base URL | (optional) |
| `ENGINE_API_KEY` | Engine ↔ Platform auth key | (optional) |
| `SYNC_INTERVAL_SECONDS` | Config sync interval | `300` |

### Gateway
| Variable | Description | Default |
|----------|-------------|---------|
| `GATEWAY_ENABLED` | Enable gateway integration | `false` |
| `GATEWAY_URL` | Gateway service URL | `http://localhost:8200` |
| `GATEWAY_SANDBOX_IMAGE` | Sandbox Docker image | `modularmind/gateway-sandbox:latest` |

### Auth
| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | `30` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL | `7` |

### MCP
| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_BOOTSTRAP_SERVERS` | Auto-register servers | (optional) |

---

## Service Ports Reference

| Service | Port | Access |
|---------|------|--------|
| Nginx | 80, 443 | External |
| Engine API | 8000 | Internal (via nginx /api) |
| Worker Health | 8001 | Internal |
| Gateway | 8200 | Internal (via nginx /gateway) |
| PostgreSQL | 5432 | Internal |
| Redis | 6379 | Internal |
| Qdrant | 6333 | Internal |
| MinIO | 9000, 9001 | Internal |
| Ollama | 11434 | Internal |
| Platform | 3000 | Internal (via nginx) |
| Chat (dev) | 3002 | Dev only |
| Ops (dev) | 3003 | Dev only |
| Grafana | 3333 | Optional |
| Prometheus | 9090 | Optional |

---

## License

Proprietary. All rights reserved.
