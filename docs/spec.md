# ModularMind V2 - Architecture Specification

> Document de reference pour la V2.
> Decisions prises le 2026-02-27. Revise le 2026-02-27.

---

## 1. Vision

ModularMind V2 separe clairement 4 composants :

| Composant | Responsabilite | Deploye ou | Pour qui | Stack |
|-----------|---------------|------------|----------|-------|
| **Platform** | Vitrine, creation agents/graphs, gestion clients, sync | Home server du owner | Owner / admins | Next.js full-stack + Prisma |
| **Engine** | Execution agents, supervisor, memory, RAG, MCP | Chez le client (self-hosted) | API headless | FastAPI + Redis Streams |
| **Chat** | Interface utilisateur final | Chez le client | End-users | Vite + React (SPA static) |
| **Ops** | Monitoring, metrics, admin, configuration | Chez le client | Admin du client | Vite + React (SPA static) |

```
OWNER (home server)                    CLIENT (self-hosted)
┌──────────────────────┐               ┌──────────────────────────────────┐
│   PLATFORM           │               │         NGINX reverse proxy      │
│   Next.js full-stack │  ◄── pull ──  │  ┌────────────────────────────┐ │
│                      │   configs     │  │ /       → Chat (static)    │ │
│   ├── vitrine        │               │  │ /ops/   → Ops (static)     │ │
│   ├── studio         │  ◄── push ──  │  │ /api/   → Engine (REST+SSE)│ │
│   ├── admin          │   reports     │  │ /health → Engine            │ │
│                      │               │  └────────────────────────────┘ │
│   PostgreSQL         │               │                                  │
└──────────────────────┘               │  ┌────────────────────────────┐ │
                                       │  │  ENGINE (headless API)     │ │
                                       │  │  FastAPI + Worker          │ │
                                       │  │  PostgreSQL + Redis        │ │
                                       │  │  Qdrant + Ollama           │ │
                                       │  └────────────────────────────┘ │
                                       └──────────────────────────────────┘
```

### Routing strategy

Un seul reverse proxy nginx chez le client expose un unique domaine/port.
Chat et Ops sont des fichiers statiques montes directement dans nginx.
Engine est le seul backend, accessible via `/api/`.

Le streaming utilise **SSE (Server-Sent Events)** sur les memes routes REST.
SSE est unidirectionnel (server → client) — suffisant car le streaming V2 est
100% server-push (tokens, traces, logs, model pull progress).

Avantages vs WebSocket :
- Pas de `map $http_upgrade` dans nginx
- Auth par cookies HttpOnly automatique (requete HTTP standard)
- Reconnexion automatique native (`EventSource` avec `Last-Event-ID`)

```
https://client.example.com/          → Chat (fichiers statiques nginx)
https://client.example.com/ops/      → Ops (fichiers statiques nginx)
https://client.example.com/api/      → Engine API (REST + SSE streaming)
https://client.example.com/health    → Engine health check
```

### Sync strategy (pull model)

L'Engine poll le Platform periodiquement pour recuperer les configs :

```
1. Client installe Engine + apps
2. Engine au demarrage : POST /api/engines/register (s'enregistre)
3. Engine toutes les 5 min : GET /api/sync/manifest (verifie versions)
4. Si nouvelle version : GET /api/sync/configs → applique localement
5. Engine toutes les 15 min : POST /api/reports (envoie metriques/status)
```

Le Platform peut optionnellement envoyer un **webhook** vers l'Engine
pour trigger un poll immediat apres un publish dans le Studio.
Si le webhook echoue (firewall, NAT), l'Engine recupere au prochain poll.

---

## 2. Decisions techniques

| Decision | Choix | Justification |
|----------|-------|---------------|
| Vector DB | **Qdrant** | Hybrid search (dense + BM25), payload filtering |
| Task queue | **Redis Streams** | Remplace Celery — un seul systeme de queues, plus leger |
| Scheduling | **APScheduler** | Remplace Celery Beat — async-native, memory jobstore |
| Memory pipeline | **Redis Streams** | Event-driven, 2 etapes (extract+score → embed) |
| Abstraction events | **EventBus interface** | Permet swap Redis Streams → Redpanda plus tard |
| Platform stack | **Next.js full-stack + Prisma** | SSR vitrine, Server Actions CRUD, zero backend separe |
| Chat stack | **Vite + React + Tailwind + shadcn/ui** | SPA leger, fichiers statiques, pas de SSR |
| Ops stack | **Vite + React + Tailwind + shadcn/ui** | SPA leger, meme stack que Chat, pas de SSR necessaire |
| Monorepo tooling | **pnpm + Turborepo** | Build cache, parallelisme, filtre par package |
| Python shared | **Package installable** (pyproject.toml) | Import propre dans Engine |
| Docker builds | **turbo prune --docker** | Builds monorepo-aware, contexte minimal |
| Streaming | **SSE (Server-Sent Events)** | Unidirectionnel suffit, auth cookie native, reconnexion auto |
| Auth Platform | **NextAuth (OAuth Google/GitHub)** | Standard, pour le owner et ses admins |
| Auth Engine | **JWT HttpOnly cookies** | Securise, meme origine via nginx |
| Auth Sync | **API key par Engine** | Simple, genere a l'enregistrement du client |
| Sync model | **Pull (Engine poll Platform)** | Marche derriere NAT/firewall, robuste |
| DB Platform | **Prisma + PostgreSQL** | TypeScript natif, migrations simples |
| DB Engine | **SQLAlchemy 2.0 async + PostgreSQL** | Inchange, battle-tested |

---

## 3. Structure du repo

```
ModularMind-V2/
│
├── platform/                         # Next.js full-stack (owner)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (marketing)/          # Vitrine publique
│   │   │   │   ├── page.tsx          # Home / landing
│   │   │   │   ├── features/
│   │   │   │   ├── pricing/
│   │   │   │   └── docs/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   └── register/
│   │   │   ├── (studio)/             # Creation agents/graphs/templates
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── agents/
│   │   │   │   ├── graphs/
│   │   │   │   ├── templates/
│   │   │   │   └── releases/
│   │   │   ├── (admin)/              # Gestion clients, engines, sync
│   │   │   │   ├── clients/
│   │   │   │   ├── engines/          # Engines enregistres + health + sync status
│   │   │   │   └── settings/
│   │   │   └── api/                   # API Routes (Next.js App Router)
│   │   │       ├── auth/[...nextauth]/   # NextAuth
│   │   │       ├── sync/
│   │   │       │   ├── manifest/route.ts # GET — Engine poll ici
│   │   │       │   └── configs/route.ts  # GET — Engine telecharge configs
│   │   │       ├── engines/
│   │   │       │   ├── register/route.ts # POST — Engine s'enregistre
│   │   │       │   └── report/route.ts   # POST — Engine envoie metriques
│   │   │       ├── agents/route.ts       # CRUD agents
│   │   │       ├── graphs/route.ts       # CRUD graphs
│   │   │       └── webhook/route.ts      # Trigger sync immediat (optionnel)
│   │   ├── components/
│   │   │   ├── marketing/
│   │   │   ├── studio/
│   │   │   └── admin/
│   │   └── lib/
│   │       ├── db.ts                 # Prisma client
│   │       ├── auth.ts               # NextAuth config
│   │       └── sync.ts               # Sync logic
│   ├── prisma/
│   │   └── schema.prisma             # Agents, Graphs, Clients, Engines, etc.
│   ├── next.config.ts
│   ├── Dockerfile
│   └── package.json                  # @modularmind/platform
│
├── engine/
│   ├── server/                       # FastAPI headless
│   │   ├── src/
│   │   │   ├── infra/                # Config, DB, Redis, Qdrant, secrets, metrics
│   │   │   │   ├── config.py
│   │   │   │   ├── database.py
│   │   │   │   ├── redis.py
│   │   │   │   ├── qdrant.py
│   │   │   │   ├── secrets.py
│   │   │   │   ├── metrics.py
│   │   │   │   ├── gpu.py
│   │   │   │   ├── token_counter.py
│   │   │   │   ├── token_pricing.py
│   │   │   │   ├── rate_limit.py
│   │   │   │   ├── sse.py            # SSE response utility
│   │   │   │   ├── url_validation.py
│   │   │   │   ├── event_bus.py      # EventBus ABC
│   │   │   │   └── redis_streams.py  # Redis Streams impl (backoff, DLQ)
│   │   │   │
│   │   │   ├── auth/                 # JWT auth, user roles
│   │   │   ├── setup/               # First-run setup wizard
│   │   │   ├── health/              # Health checks
│   │   │   │
│   │   │   ├── domain_config/       # Agent/graph config loading (YAML/JSON + Redis ephemeral)
│   │   │   ├── supervisor/          # Supervisor routing, ephemeral factory
│   │   │   ├── prompt_layers/       # Composable prompt system
│   │   │   ├── graph_engine/        # LangGraph compiler, callbacks, condition eval
│   │   │   ├── executions/          # Execution engine, approval, feedback, SSE streaming
│   │   │   │
│   │   │   ├── llm/                 # LLM providers (OpenAI, Anthropic, Ollama)
│   │   │   ├── embedding/           # Embedding providers (Ollama)
│   │   │   ├── models/              # Model management, Ollama pull
│   │   │   │
│   │   │   ├── memory/              # Memory CRUD + queries
│   │   │   ├── rag/                 # RAG (collections, documents, chunking, retrieval)
│   │   │   │
│   │   │   ├── pipeline/            # Memory pipeline (Redis Streams)
│   │   │   │   ├── __init__.py
│   │   │   │   ├── consumer.py      # Consumer runner (graceful shutdown)
│   │   │   │   └── handlers/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── extractor.py # memory:raw → memory:extracted (extract + score)
│   │   │   │       └── embedder.py  # memory:extracted → Qdrant + PostgreSQL
│   │   │   │
│   │   │   ├── worker/              # Redis Streams task consumers
│   │   │   │   ├── __init__.py
│   │   │   │   ├── runner.py        # Main worker process (consumers + scheduler)
│   │   │   │   ├── tasks.py         # Task handlers (graph exec, model pull, etc.)
│   │   │   │   └── scheduler.py     # APScheduler (periodic tasks)
│   │   │   │
│   │   │   ├── conversations/       # Conversation CRUD, message history
│   │   │   ├── connectors/          # External channels (Slack, Teams, etc.)
│   │   │   ├── mcp/                 # MCP registry, sidecars, tool discovery
│   │   │   │
│   │   │   ├── sync/                # Sync module (pull from Platform)
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py        # GET /sync/manifest, POST /sync/trigger
│   │   │   │   ├── service.py       # Poll Platform, apply configs
│   │   │   │   └── schemas.py       # Sync payload schemas
│   │   │   │
│   │   │   ├── report/              # Report back to Platform
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py        # GET /report/{status,metrics,pipeline}
│   │   │   │   └── service.py
│   │   │   │
│   │   │   ├── admin/               # Admin user management
│   │   │   ├── groups/              # User groups, RBAC
│   │   │   └── internal/            # Protected dashboard endpoints
│   │   │
│   │   ├── seed/                    # Seed data (68 agents + 3 graphs)
│   │   │   ├── agents/
│   │   │   └── graphs/
│   │   │
│   │   ├── alembic/                 # DB migrations (prefix: engine_)
│   │   ├── Dockerfile
│   │   ├── pyproject.toml
│   │   └── tests/
│   │
│   └── mcp-sidecars/
│       ├── Dockerfile.brave-search
│       ├── Dockerfile.duckduckgo
│       ├── Dockerfile.motherduck
│       ├── Dockerfile.node-proxy
│       ├── Dockerfile.puppeteer
│       ├── Dockerfile.qdrant
│       └── Dockerfile.whatsapp
│
├── apps/
│   ├── chat/                        # Vite + React (end-user SPA)
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── pages/
│   │   │   │   ├── Login.tsx
│   │   │   │   └── Chat.tsx
│   │   │   ├── components/
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── AgentSelector.tsx
│   │   │   │   ├── FileUpload.tsx
│   │   │   │   ├── StreamingMessage.tsx
│   │   │   │   └── ConversationList.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useChat.ts
│   │   │   │   ├── useStreaming.ts
│   │   │   │   └── useAuth.ts
│   │   │   └── lib/
│   │   │       └── api.ts           # Utilise @modularmind/api-client
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json             # @modularmind/chat
│   │   └── tsconfig.json
│   │
│   └── ops/                         # Vite + React (admin SPA)
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── Login.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Agents.tsx
│       │   │   ├── Graphs.tsx
│       │   │   ├── Models.tsx
│       │   │   ├── Monitoring.tsx
│       │   │   ├── Configuration.tsx
│       │   │   ├── Knowledge.tsx
│       │   │   ├── Playground.tsx
│       │   │   └── Users.tsx
│       │   ├── components/
│       │   │   ├── monitoring/
│       │   │   ├── configuration/
│       │   │   ├── knowledge/
│       │   │   ├── playground/
│       │   │   ├── users/
│       │   │   └── shared/
│       │   ├── hooks/
│       │   │   ├── useStreaming.ts
│       │   │   └── useAuth.ts
│       │   └── lib/
│       │       └── api.ts           # Utilise @modularmind/api-client
│       ├── index.html
│       ├── vite.config.ts           # base: '/ops'
│       ├── package.json             # @modularmind/ops
│       └── tsconfig.json
│
├── packages/
│   ├── api-client/                  # Types + client API partage (Chat + Ops)
│   │   ├── src/
│   │   │   ├── client.ts            # Base HTTP client (HttpOnly cookies, refresh mutex)
│   │   │   ├── types/
│   │   │   │   ├── agents.ts
│   │   │   │   ├── graphs.ts
│   │   │   │   ├── executions.ts
│   │   │   │   ├── conversations.ts
│   │   │   │   ├── models.ts
│   │   │   │   ├── rag.ts
│   │   │   │   ├── monitoring.ts
│   │   │   │   └── auth.ts
│   │   │   └── index.ts
│   │   ├── package.json             # @modularmind/api-client
│   │   └── tsconfig.json
│   │
│   └── ui/                          # Composants shadcn/ui partages
│       ├── src/
│       │   ├── components/
│       │   ├── lib/utils.ts
│       │   └── index.ts
│       ├── package.json             # @modularmind/ui
│       └── tsconfig.json
│
├── shared/                          # Python shared (Engine interne uniquement)
│   ├── pyproject.toml               # modularmind-shared
│   ├── src/
│   │   └── modularmind_shared/
│   │       ├── __init__.py
│   │       ├── schemas/
│   │       │   ├── agents.py
│   │       │   ├── graphs.py
│   │       │   └── sync.py
│   │       └── protocols/
│   │           └── runtime.py
│   └── tests/
│
├── docker/
│   ├── docker-compose.yml           # Client (nginx + engine + worker + infra)
│   ├── docker-compose.platform.yml  # Owner (next.js + pg)
│   ├── docker-compose.dev.yml       # Dev local
│   └── nginx/
│       └── client.conf              # Reverse proxy + static files
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── Makefile
├── .gitignore
└── .env.example
```

---

## 4. Engine API Surface

### 4.1 Routes publiques (Chat + externe)

```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/agents
GET    /api/v1/agents/:id
GET    /api/v1/graphs
GET    /api/v1/graphs/:id

POST   /api/v1/conversations
GET    /api/v1/conversations
GET    /api/v1/conversations/:id
POST   /api/v1/conversations/:id/messages
DELETE /api/v1/conversations/:id

POST   /api/v1/executions
GET    /api/v1/executions/:id
GET    /api/v1/executions/:id/stream         # SSE streaming

GET    /api/v1/models

POST   /api/v1/rag/search
GET    /api/v1/rag/collections

GET    /api/v1/memory/:agent_id

GET    /health
```

### 4.2 Routes admin (Ops Console — RBAC role ADMIN/OWNER)

```
# Monitoring
GET    /api/v1/internal/monitoring
GET    /api/v1/internal/monitoring/gpu
GET    /api/v1/internal/monitoring/pipeline   # Pipeline Redis Streams health
GET    /api/v1/internal/logs/stream           # SSE log streaming
GET    /api/v1/internal/logs

# Configuration
GET    /api/v1/internal/settings
PATCH  /api/v1/internal/settings
GET    /api/v1/internal/providers

# Actions
POST   /api/v1/internal/actions/restart
POST   /api/v1/internal/actions/purge

# Alerts
GET    /api/v1/internal/alerts
POST   /api/v1/internal/alerts
PATCH  /api/v1/internal/alerts/:id

# MCP
GET    /api/v1/internal/mcp/servers
POST   /api/v1/internal/mcp/servers
DELETE /api/v1/internal/mcp/servers/:id
GET    /api/v1/mcp/tools

# Users
GET    /api/v1/admin/users
POST   /api/v1/admin/users
PATCH  /api/v1/admin/users/:id

# Groups
GET    /api/v1/groups
POST   /api/v1/groups

# RAG admin
POST   /api/v1/rag/collections
DELETE /api/v1/rag/collections/:id
POST   /api/v1/rag/collections/:id/documents
DELETE /api/v1/rag/documents/:id

# Memory admin
GET    /api/v1/memory
DELETE /api/v1/memory/:id

# Models admin
POST   /api/v1/models/pull
GET    /api/v1/models/pull/:task_id/stream   # SSE pull progress
POST   /api/v1/models
DELETE /api/v1/models/:id

# Supervisor config
GET    /api/v1/internal/supervisor/layers
PATCH  /api/v1/internal/supervisor/layers/:name

# Playground
POST   /api/v1/internal/playground/execute
GET    /api/v1/internal/playground/traces
```

### 4.3 Routes sync (Engine ← Platform, pull model)

L'Engine expose ces routes pour que le scheduler interne les utilise.
Le Platform expose des API Routes equivalentes cote Next.js.

```
# Cote Engine (interne, appele par le scheduler)
GET    /api/v1/sync/manifest                  # Compare avec le Platform
POST   /api/v1/sync/trigger                   # Force un poll immediat (webhook du Platform)
POST   /api/v1/sync/apply                     # Applique des configs (interne)

# Cote Platform (API Routes Next.js)
POST   /api/engines/register                  # Engine s'enregistre
GET    /api/sync/manifest                     # Engine poll ici
GET    /api/sync/configs                      # Engine telecharge configs
POST   /api/reports                           # Engine envoie metriques

# Auth sync : API key dans header
# Header: X-Engine-Key: <api-key>
```

### 4.4 Routes report (Engine → Platform)

L'Engine expose ces endpoints pour consultation locale ET pour le Platform :

```
GET    /api/v1/report/status                  # Etat de sante
GET    /api/v1/report/metrics                 # Metriques d'usage
GET    /api/v1/report/models                  # Modeles deployes
GET    /api/v1/report/pipeline                # Etat pipeline memoire
```

### 4.5 Webhooks entrants

```
POST   /webhooks/slack
POST   /webhooks/teams
POST   /webhooks/discord
POST   /webhooks/email
POST   /webhooks/custom/:connector_id
```

---

## 5. Memory Pipeline (Redis Streams)

### 5.1 Architecture (2 etapes)

```
Execution terminee
       │
       │  await event_bus.publish("memory:raw", {...})
       ▼
  ┌─────────────────────────────────────────────────┐
  │  Stream: memory:raw                              │
  │  Consumer Group: extractors                      │
  │                                                  │
  │  HANDLER: Extractor (extract + score)            │
  │  • Input: raw messages                           │
  │  • Process: LLM extrait faits importants         │
  │    avec score de confiance (0-1)                 │
  │  • Filter: score < 0.3 → drop (XACK sans emit)  │
  │  • XADD memory:extracted { facts + scores }      │
  │  • XACK memory:raw                               │
  │  • On failure apres 3 retries → DLQ              │
  └──────────────────┬──────────────────────────────┘
                     ▼
  ┌─────────────────────────────────────────────────┐
  │  Stream: memory:extracted                        │
  │  Consumer Group: embedders                       │
  │                                                  │
  │  HANDLER: Embedder                               │
  │  • Input: scored facts                           │
  │  • Process:                                      │
  │    - Generate embedding (nomic-embed-text)        │
  │    - Upsert → Qdrant (collection: memory)        │
  │    - Insert → PostgreSQL (metadata, scores)      │
  │  • XACK memory:extracted                         │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │  Stream: memory:dlq  (Dead Letter Queue)         │
  │  • Messages echoues apres max retries            │
  │  • Consultable via l'Ops Console                 │
  │  • Rejouable manuellement                        │
  └─────────────────────────────────────────────────┘

  APScheduler (every 6h):
  ┌─────────────────────────────────────────────────┐
  │  TASK: memory.consolidate                        │
  │  • Fusionne faits redondants (cosine similarity) │
  │  • Applique decay temporel aux scores            │
  │  • Prune memoires score < 0.1                    │
  └─────────────────────────────────────────────────┘
```

### 5.2 EventBus Interface

```python
# engine/server/src/infra/event_bus.py

from abc import ABC, abstractmethod
from typing import Any, Callable, Awaitable

class EventBus(ABC):
    """Abstraction pour le transport d'evenements.
    Implementation actuelle: Redis Streams.
    Future possible: Redpanda/Kafka.
    """

    @abstractmethod
    async def publish(self, stream: str, data: dict[str, Any]) -> str: ...

    @abstractmethod
    async def subscribe(
        self, stream: str, group: str, consumer: str,
        handler: Callable[[dict[str, Any]], Awaitable[None]],
        max_retries: int = 3,
    ) -> None: ...

    @abstractmethod
    async def ensure_group(self, stream: str, group: str) -> None: ...

    @abstractmethod
    async def stream_info(self, stream: str) -> dict[str, Any]: ...

    @abstractmethod
    def stop(self) -> None: ...
```

### 5.3 Redis Streams Implementation

```python
# engine/server/src/infra/redis_streams.py

import asyncio
import logging
from redis.asyncio import Redis
from redis.exceptions import ResponseError
from .event_bus import EventBus

logger = logging.getLogger(__name__)

DLQ_STREAM = "memory:dlq"
INITIAL_BACKOFF = 1.0
MAX_BACKOFF = 30.0

class RedisStreamBus(EventBus):
    def __init__(self, redis: Redis):
        self.redis = redis
        self._running = True

    def stop(self):
        self._running = False

    async def publish(self, stream: str, data: dict) -> str:
        return await self.redis.xadd(stream, data)

    async def subscribe(self, stream, group, consumer, handler, max_retries=3):
        await self.ensure_group(stream, group)
        backoff = INITIAL_BACKOFF

        while self._running:
            try:
                messages = await self.redis.xreadgroup(
                    groupname=group, consumername=consumer,
                    streams={stream: ">"}, count=10, block=5000,
                )
                backoff = INITIAL_BACKOFF

                for stream_name, entries in messages:
                    for msg_id, data in entries:
                        retry_count = int(data.get(b"_retry_count", 0))
                        try:
                            await handler(data)
                            await self.redis.xack(stream, group, msg_id)
                        except Exception:
                            logger.exception("handler_failed", extra={
                                "stream": stream, "msg_id": msg_id, "retry": retry_count,
                            })
                            if retry_count >= max_retries:
                                await self.redis.xadd(DLQ_STREAM, {
                                    b"original_stream": stream,
                                    b"original_id": msg_id,
                                    b"error": f"{retry_count} retries exhausted",
                                    b"data": str(data),
                                })
                                await self.redis.xack(stream, group, msg_id)
                            else:
                                data[b"_retry_count"] = str(retry_count + 1)
                                await self.redis.xadd(stream, data)
                                await self.redis.xack(stream, group, msg_id)

            except (ConnectionError, OSError):
                logger.warning("redis_connection_lost", extra={"backoff": backoff})
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)

    async def ensure_group(self, stream, group):
        try:
            await self.redis.xgroup_create(stream, group, id="0", mkstream=True)
        except ResponseError:
            pass

    async def stream_info(self, stream: str) -> dict:
        try:
            info = await self.redis.xinfo_stream(stream)
            groups = await self.redis.xinfo_groups(stream)
            return {
                "length": info.get("length", 0),
                "groups": [
                    {"name": g["name"], "pending": g["pending"],
                     "consumers": g["consumers"]}
                    for g in groups
                ],
            }
        except ResponseError:
            return {"length": 0, "groups": []}
```

### 5.4 Worker (remplace Celery)

Le worker est un process Python unique qui :
1. Consomme les Redis Streams (tasks + pipeline)
2. Execute APScheduler pour les taches periodiques
3. Expose un health endpoint

```python
# engine/server/src/worker/runner.py

import asyncio
import logging
import os
import signal

from src.infra.config import settings
from src.infra.redis_streams import RedisStreamBus
from src.worker.tasks import graph_execution_handler, model_pull_handler
from src.worker.scheduler import create_scheduler

logger = logging.getLogger(__name__)

HEALTH_PORT = int(os.environ.get("WORKER_HEALTH_PORT", "8001"))

async def health_server(bus: RedisStreamBus, port: int):
    """Minimal TCP health check for Docker."""
    async def handle(reader, writer):
        try:
            await bus.redis.ping()
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
        except Exception:
            writer.write(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 4\r\n\r\nfail")
        await writer.drain()
        writer.close()
    server = await asyncio.start_server(handle, "0.0.0.0", port)
    async with server:
        await server.serve_forever()

async def main():
    from src.infra.redis import redis_client

    bus = RedisStreamBus(redis_client)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, bus.stop)

    logger.info("Worker starting — Redis Streams + APScheduler")

    # Start APScheduler
    scheduler = create_scheduler()
    scheduler.start()

    # Pipeline handlers (uncomment once implemented)
    # from src.pipeline.handlers.extractor import extractor_handler
    # from src.pipeline.handlers.embedder import embedder_handler

    tasks = [
        # Task queues (replaces Celery)
        bus.subscribe("tasks:executions", "workers", "w-1", graph_execution_handler),
        bus.subscribe("tasks:models", "workers", "w-1", model_pull_handler),
        # Memory pipeline (uncomment once implemented)
        # bus.subscribe("memory:raw", "extractors", "ext-1", extractor_handler),
        # bus.subscribe("memory:extracted", "embedders", "emb-1", embedder_handler),
        # Health
        health_server(bus, HEALTH_PORT),
    ]

    logger.info("Worker ready — consuming streams")

    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Consumer %d failed: %s", i, result)
    finally:
        scheduler.shutdown(wait=False)
        await redis_client.aclose()
        logger.info("Worker stopped")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
    asyncio.run(main())
```

```python
# engine/server/src/worker/scheduler.py

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from src.infra.config import settings

logger = logging.getLogger(__name__)

def create_scheduler() -> AsyncIOScheduler:
    """APScheduler — remplace Celery Beat.

    Utilise le memory jobstore par defaut (suffisant avec un seul worker).
    """
    scheduler = AsyncIOScheduler()

    # Sync poll (configurable, default 5 min)
    if settings.PLATFORM_URL:
        scheduler.add_job(
            sync_platform, "interval",
            seconds=settings.SYNC_INTERVAL_SECONDS,
            id="sync_platform",
            name="Poll platform for config updates",
        )

    # TODO: Add more periodic jobs:
    # - Memory consolidation (daily at 3am)
    # - Metrics flush (every 60s)
    # - Stale execution cleanup (every 5min)
    # - MCP sidecar health check (every 2min)

    return scheduler

async def sync_platform() -> None:
    """Poll platform for manifest changes and apply updates."""
    # TODO: Implement — delegates to src.sync.service
    logger.debug("Polling platform for config updates")
```

---

## 6. Authentication

### 6.1 Auth Engine (JWT HttpOnly cookies)

```
POST /api/v1/auth/login
  Body: { email, password }
  Response: { user: { id, email, name, role } }
  Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=1800
  Set-Cookie: refresh_token=<opaque_uuid>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=604800

POST /api/v1/auth/refresh
  Cookie: refresh_token=<opaque_uuid>
  Response: 200
  Set-Cookie: access_token=<new_jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=1800

POST /api/v1/auth/logout
  Response: 200
  Set-Cookie: access_token=; Max-Age=0
  Set-Cookie: refresh_token=; Max-Age=0
```

- **Access token** = JWT (user_id, role, exp) — 30 min
- **Refresh token** = UUID opaque stocke dans Redis avec TTL 7 jours — permet revocation
- **`SameSite=Strict`** car tout est sur le meme domaine via nginx
- **`Secure`** en production (HTTPS)
- **`Path` restrictif** : refresh token envoye uniquement sur `/api/v1/auth/refresh`

### 6.2 Auth Platform (NextAuth)

- OAuth Google + GitHub via NextAuth.js
- Session cookie classique NextAuth
- Pour le owner et ses admins uniquement

### 6.3 Auth Sync (API key)

- Chaque Engine recoit une API key a l'enregistrement
- Header `X-Engine-Key: <api-key>` sur tous les appels Engine → Platform
- Le Platform valide la cle et identifie le client

---

## 7. Packages partages

### 7.1 @modularmind/api-client

Client API TypeScript partage entre Chat et Ops. Auth par HttpOnly cookies.

```typescript
// packages/api-client/src/client.ts

let refreshPromise: Promise<void> | null = null;

export function createApiClient(config: { basePath: string; onUnauthorized?: () => void }) {
  async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    const res = await fetch(`${config.basePath}${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401) {
      if (!refreshPromise) {
        refreshPromise = fetch(`${config.basePath}/auth/refresh`, {
          method: 'POST', credentials: 'include',
        }).then(r => {
          if (!r.ok) { config.onUnauthorized?.(); throw new Error('Session expired'); }
        }).finally(() => { refreshPromise = null; });
      }
      await refreshPromise;
      return request(method, path, options);
    }

    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  }

  return {
    auth: createAuthApi(request),
    conversations: createConversationsApi(request),
    executions: createExecutionsApi(request),
    agents: createAgentsApi(request),
    models: createModelsApi(request),
    rag: createRagApi(request),
    memory: createMemoryApi(request),
    monitoring: createMonitoringApi(request),
    settings: createSettingsApi(request),
    admin: createAdminApi(request),
    mcp: createMcpApi(request),
    playground: createPlaygroundApi(request),
  };
}
```

Utilisation :
```typescript
// apps/chat/src/lib/api.ts
export const api = createApiClient({
  basePath: '/api/v1',
  onUnauthorized: () => window.dispatchEvent(new CustomEvent('auth:unauthorized')),
});

// apps/ops/src/lib/api.ts  (meme chose, base: '/ops' gere par vite config)
export const api = createApiClient({
  basePath: '/api/v1',
  onUnauthorized: () => window.dispatchEvent(new CustomEvent('auth:unauthorized')),
});
```

### 7.2 @modularmind/ui

Composants shadcn/ui partages. Les deux apps importent depuis ce package.

```typescript
import { Button, Card, Dialog, Tabs } from '@modularmind/ui';
```

---

## 8. SSE Streaming Utility

```python
# engine/server/src/infra/sse.py

import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any
from fastapi import Request
from starlette.responses import StreamingResponse

async def sse_response(
    generator: AsyncGenerator[dict[str, Any], None],
    request: Request,
) -> StreamingResponse:
    async def stream():
        try:
            async for event in generator:
                if await request.is_disconnected():
                    break
                event_type = event.get("type", "message")
                event_id = event.get("id")
                lines = f"event: {event_type}\n"
                if event_id:
                    lines += f"id: {event_id}\n"
                lines += f"data: {json.dumps(event)}\n\n"
                yield lines
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

SSE endpoints :

| Endpoint | Event types | Usage |
|----------|-------------|-------|
| `GET /api/v1/executions/:id/stream` | `tokens`, `trace`, `step`, `complete`, `error` | Chat + Playground |
| `GET /api/v1/internal/logs/stream` | `log` | Ops log viewer |
| `GET /api/v1/models/pull/:task_id/stream` | `progress`, `complete`, `error` | Ops model pull UI |

---

## 9. Nginx Configuration (client)

Chat et Ops sont des fichiers statiques montes directement dans nginx.
Pas de containers dedies — un seul nginx sert tout.

```nginx
# docker/nginx/client.conf

server {
    listen 80;
    server_name _;

    # ── Engine API (REST + SSE) ──
    location /api/ {
        proxy_pass http://engine:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        client_max_body_size 100M;
    }

    location /health {
        proxy_pass http://engine:8000;
    }

    location /webhooks/ {
        proxy_pass http://engine:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # ── Ops Console (static SPA at /ops/) ──
    location /ops/ {
        alias /usr/share/nginx/html/ops/;
        try_files $uri $uri/ /ops/index.html;
    }

    # Redirect /ops to /ops/
    location = /ops {
        return 301 /ops/;
    }

    # ── Chat (static SPA, catch-all) ──
    location / {
        root /usr/share/nginx/html/chat;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 10. Docker Compose (client)

```yaml
# docker/docker-compose.yml

x-engine-env: &engine-env
  DATABASE_URL: postgresql+asyncpg://${DB_USER:-modularmind}:${DB_PASSWORD}@db:5432/modularmind
  REDIS_URL: redis://redis:6379/0
  QDRANT_URL: http://qdrant:6333
  OLLAMA_BASE_URL: http://ollama:11434
  SECRET_KEY: ${SECRET_KEY}
  PLATFORM_URL: ${PLATFORM_URL}
  ENGINE_API_KEY: ${ENGINE_API_KEY}

x-engine-depends: &engine-depends
  db: { condition: service_healthy }
  redis: { condition: service_healthy }
  qdrant: { condition: service_healthy }

services:
  # ── Infrastructure ──
  db:
    image: postgres:16-alpine
    volumes: [postgres-data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: modularmind
      POSTGRES_USER: ${DB_USER:-modularmind}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-modularmind}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes: [redis-data:/data]
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  qdrant:
    image: qdrant/qdrant:v1.13.0
    volumes: [qdrant-data:/qdrant/storage]
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:6333/readyz"]
      interval: 10s

  ollama:
    image: ollama/ollama:latest
    volumes: [ollama-data:/root/.ollama]
    profiles: [ollama]

  # ── Engine (single image, 2 services) ──
  engine:
    build:
      context: ..
      dockerfile: engine/server/Dockerfile
    image: modularmind/engine:latest
    depends_on: *engine-depends
    environment:
      <<: *engine-env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 5s
      retries: 3

  worker:
    image: modularmind/engine:latest
    command: python -m src.worker.runner
    depends_on: *engine-depends
    environment:
      <<: *engine-env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 15s
      timeout: 5s
      retries: 3

  # ── Nginx (sert Chat + Ops static + proxy Engine) ──
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/client.conf:/etc/nginx/conf.d/default.conf:ro
      - chat-static:/usr/share/nginx/html/chat:ro
      - ops-static:/usr/share/nginx/html/ops:ro
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    depends_on: [engine]

volumes:
  postgres-data:
  redis-data:
  qdrant-data:
  ollama-data:
  chat-static:
  ops-static:
```

Note : les volumes `chat-static` et `ops-static` sont peuples au build
via un init container ou un script de deploiement. Alternative : multi-stage
build qui copie les fichiers directement dans l'image nginx.

### Docker Compose Platform

```yaml
# docker/docker-compose.platform.yml

services:
  platform:
    build:
      context: ..
      dockerfile: platform/Dockerfile
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://${DB_USER:-modularmind}:${DB_PASSWORD}@db:5432/modularmind_platform
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${PLATFORM_URL}
    depends_on:
      db: { condition: service_healthy }

  db:
    image: postgres:16-alpine
    volumes: [postgres-data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: modularmind_platform
      POSTGRES_USER: ${DB_USER:-modularmind}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-modularmind}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

---

## 11. Turborepo Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "platform"
```

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", ".next/standalone/**"]
    },
    "dev": { "persistent": true, "cache": false },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

---

## 12. Migration mapping (ancien → nouveau)

| Ancien | Nouveau | Action |
|--------|---------|--------|
| `backend/src/` | `platform/` (Next.js full-stack) | Reecrire en Server Actions + Prisma |
| `frontend/src/` | `platform/src/app/(studio)/` | Adapter pour Next.js App Router |
| `runtime/server/src/` | `engine/server/src/` | Copier, supprimer Celery, ajouter Redis Streams |
| `runtime/server/src/workers/` | `engine/server/src/worker/` | Reecrire: Redis Streams + APScheduler |
| `runtime/server/src/executions/websocket.py` | *(supprime)* | Remplace par `infra/sse.py` |
| `runtime/server/src/manifest/` | `engine/server/src/sync/` | Reecrire pour pull model |
| `runtime/server/tests/` | `engine/server/tests/` | Copier, adapter imports |
| `runtime/server/seed/` | `engine/server/seed/` | Copier les 68 agents + 3 graphs |
| `runtime/dashboard/src/components/chat/` | `apps/chat/src/components/` | Adapter pour Vite |
| `runtime/dashboard/src/app/(dashboard)/chat/` | `apps/chat/src/pages/Chat.tsx` | Reecrire pour React Router |
| `runtime/dashboard/src/app/(dashboard)/*` (sauf chat) | `apps/ops/src/pages/` | Reecrire pour Vite + React Router |
| `runtime/dashboard/src/components/ui/` | `packages/ui/src/components/` | Extraire en package |
| `runtime/dashboard/src/lib/api/runtime-client.ts` | `packages/api-client/src/client.ts` | Refactor: cookies same-origin |
| `runtime/mcp-sidecars/` | `engine/mcp-sidecars/` | Copier tel quel |
| `runtime/sync-service/` | *(supprime)* | Remplace par Engine sync/ pull |
| `shared/` | `shared/` (package installable) | Restructurer, Engine interne uniquement |
| `docker-compose.yml` | `docker/docker-compose.yml` | Reecrire (moins de containers) |

---

## 13. Ce qui est NOUVEAU

| Composant | Description |
|-----------|------------|
| `platform/` | Next.js full-stack (vitrine + studio + admin) |
| `engine/server/src/infra/sse.py` | SSE response utility |
| `engine/server/src/infra/event_bus.py` | EventBus ABC |
| `engine/server/src/infra/redis_streams.py` | Redis Streams impl (backoff, DLQ) |
| `engine/server/src/worker/` | Worker unifie (Redis Streams + APScheduler) |
| `engine/server/src/pipeline/` | Pipeline memoire 2 etapes |
| `engine/server/src/sync/` | Sync pull model |
| `engine/server/src/report/` | Endpoints reporting |
| `apps/chat/` | Chat SPA (Vite + React) |
| `apps/ops/` | Ops SPA (Vite + React) |
| `packages/api-client/` | Client API partage |
| `packages/ui/` | Composants UI partages |
| `docker/nginx/client.conf` | Nginx servant static + proxy |
| Pull sync model | Engine poll Platform |
| API key auth sync | API key par Engine |
| JWT HttpOnly cookies | 2 cookies separes (access + refresh) |

---

## 14. Client onboarding

Le client recoit des images Docker pre-build :

```bash
# Telecharger le compose + env
curl -O https://registry.example.com/modularmind/docker-compose.yml
curl -O https://registry.example.com/modularmind/.env.example
cp .env.example .env

# Remplir :
# - DB_PASSWORD
# - SECRET_KEY
# - PLATFORM_URL (url du Platform owner)
# - ENGINE_API_KEY (fournie par le owner)

# Lancer
docker compose up -d

# → http://localhost/          (Chat)
# → http://localhost/ops/      (Ops Console)
# → http://localhost/ops/setup (Premier user)
```

L'Engine s'enregistre automatiquement aupres du Platform au demarrage
et commence a synchroniser les configs.
