# ModularMind V2 - Architecture Specification

> Document de reference pour la migration vers la nouvelle architecture.
> Decisions prises le 2026-02-27. Revise apres review critique.

---

## 1. Vision

ModularMind V2 separe clairement 4 composants avec des responsabilites distinctes :

| Composant | Responsabilite | Deploye ou | Pour qui |
|-----------|---------------|------------|----------|
| **Studio** | Creation agents/graphs, templates, releases, gestion tenants | Chez le owner uniquement | Le createur/developpeur |
| **Engine** | Execution agents, supervisor, memory, RAG, MCP | Chez le client (self-hosted) | API headless, pas d'UI |
| **Chat** | Interface utilisateur final | Chez le client | End-users |
| **Ops** | Monitoring, metrics, admin, configuration | Chez le client | Admin du client |

```
OWNER                              CLIENT (self-hosted)
┌──────────────┐                   ┌──────────────────────────────────────────┐
│   STUDIO     │   push configs    │         NGINX reverse proxy              │
│              │ ─────────────────►│  ┌─────────────────────────────────────┐ │
│  backend     │                   │  │  / ──────────► Chat (static files)  │ │
│  frontend    │◄───────────────── │  │  /ops ───────► Ops (Next.js SSR)    │ │
│              │   pull reports    │  │  /api ────────► Engine (REST + SSE)  │ │
└──────────────┘                   │  └─────────────────────────────────────┘ │
                                   │                                          │
                                   │  ┌────────────────────────────────────┐  │
                                   │  │  ENGINE (headless API)             │  │
                                   │  │  FastAPI + Celery + Pipeline       │  │
                                   │  │  PostgreSQL + Redis + Qdrant       │  │
                                   │  └────────────────────────────────────┘  │
                                   └──────────────────────────────────────────┘
```

### Routing strategy (C1 fix)

Un seul reverse proxy nginx expose un unique domaine/port. Chat, Ops et Engine
sont tous accessibles sur la meme origine — les HttpOnly cookies fonctionnent
partout sans CORS cross-origin.

Le streaming utilise **SSE (Server-Sent Events)** sur les memes routes REST
(`GET /api/v1/executions/{id}/stream`, `GET /api/v1/internal/logs/stream`, etc.).
SSE est unidirectionnel (server → client) — suffisant car le streaming V2 est
100% server-push (tokens, traces, logs, model pull progress). Avantages vs WebSocket :
- Pas de `map $http_upgrade` dans nginx, pas de `proxy_read_timeout 86400s`
- Auth par cookies HttpOnly automatique (meme request HTTP classique)
- Reconnexion automatique native (`EventSource` avec `Last-Event-ID`)
- Pas de one-time ticket auth hack cote serveur

```
https://client.example.com/          → Chat (fichiers statiques)
https://client.example.com/ops/      → Ops Console (Next.js, basePath=/ops)
https://client.example.com/api/      → Engine API (REST + SSE streaming)
https://client.example.com/health    → Engine health check
```

---

## 2. Decisions techniques

| Decision | Choix | Justification |
|----------|-------|---------------|
| Vector DB | **Qdrant** | Hybrid search (dense + BM25), payload filtering, scaling |
| Task execution | **Celery** (conserve) | 26 modules existants, battle-tested, pas de reecriture |
| Memory pipeline | **Redis Streams** (nouveau) | Event-driven, zero service ajoute, consumer groups |
| Abstraction events | **EventBus interface** | Permet swap Redis Streams → Redpanda plus tard |
| Chat stack | **Vite + React + Tailwind + shadcn/ui** | Leger, rapide, embeddable, pas de SSR necessaire |
| Ops stack | **Next.js 16 + React 19** | Data-heavy, multi-pages, routing complexe |
| Studio stack | **Next.js + FastAPI** (conserve) | Deja en place, peu de changements |
| Monorepo tooling | **pnpm + Turborepo** | Build cache, parallelisme, filtre par package |
| Python shared | **Package installable** (pyproject.toml) | Import propre entre Engine et Studio |
| Docker builds | **turbo prune --docker** | Builds monorepo-aware, contexte minimal |
| Streaming | **SSE (Server-Sent Events)** | Unidirectionnel suffit, auth cookie native, reconnexion auto, nginx simple |
| Auth | **HttpOnly cookies, meme origine via nginx** | Pattern existant conserve, securise |

---

## 3. Structure du nouveau repo

```
ModularMind-V2/
│
├── studio/
│   ├── backend/                    # FastAPI - gestion agents/graphs/templates
│   │   ├── src/
│   │   │   ├── agents/             # CRUD agents + templates
│   │   │   ├── graphs/             # CRUD graphs + validation
│   │   │   ├── auth/               # OAuth (Google, GitHub)
│   │   │   ├── clients/            # Multi-tenant client management
│   │   │   ├── core/               # Config, database, exceptions
│   │   │   ├── channels/           # Communication channels
│   │   │   ├── executions/         # Test execution (playground)
│   │   │   ├── history/            # Conversation history
│   │   │   ├── llm/               # LLM provider config
│   │   │   ├── memory/             # Memory config (pas de data)
│   │   │   ├── metrics/            # Telemetry aggregation depuis les engines
│   │   │   ├── providers/          # Provider management
│   │   │   ├── rag/                # RAG config (scopes, params - pas de data)
│   │   │   ├── releases/           # Channel-based versioning (dev/beta/stable)
│   │   │   ├── settings/           # Encrypted settings
│   │   │   ├── sync/               # Push API vers les engines + offline queue (PendingSyncPush model)
│   │   │   ├── teams/              # Team/organization management
│   │   │   └── templates/          # Agent/graph templates library
│   │   ├── alembic/                # DB migrations (revision prefix: studio_)
│   │   ├── Dockerfile
│   │   ├── pyproject.toml
│   │   └── tests/
│   │
│   └── frontend/                   # Next.js - UI de creation
│       ├── src/
│       │   ├── app/                # Pages (agent editor, graph editor, etc.)
│       │   ├── components/
│       │   ├── contexts/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── stores/
│       ├── Dockerfile
│       └── package.json
│
├── engine/
│   ├── server/                     # FastAPI - execution headless
│   │   ├── src/
│   │   │   ├── infra/              # Infrastructure (DB, Redis, Qdrant, secrets, metrics)
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
│   │   │   │   ├── sse.py            # NOUVEAU - SSE response utility (remplace websocket.py)
│   │   │   │   ├── url_validation.py
│   │   │   │   └── vector_store.py
│   │   │   │
│   │   │   ├── auth/               # JWT auth, user roles
│   │   │   ├── setup/              # First-run setup wizard
│   │   │   ├── health/             # Health checks
│   │   │   │
│   │   │   ├── domain_config/      # Agent/graph config loading (YAML/JSON + Redis ephemeral)
│   │   │   ├── supervisor/         # Supervisor routing, ephemeral factory
│   │   │   ├── prompt_layers/      # Composable prompt system (identity/personality/task/context)
│   │   │   ├── graph_engine/       # LangGraph compiler, callbacks, condition eval
│   │   │   ├── executions/         # Execution engine, approval, feedback, SSE streaming
│   │   │   │
│   │   │   ├── llm/                # LLM providers (OpenAI, Anthropic, Ollama)
│   │   │   ├── embedding/          # Embedding providers (Ollama)
│   │   │   ├── models/             # Model management, Ollama pull
│   │   │   │
│   │   │   ├── memory/             # Memory CRUD + queries (short/long/episodic)
│   │   │   ├── rag/                # RAG (collections, documents, chunking, retrieval, reranking)
│   │   │   ├── recall/             # RAG quality testing
│   │   │   │
│   │   │   ├── pipeline/           # NOUVEAU - Event-driven memory pipeline
│   │   │   │   ├── __init__.py
│   │   │   │   ├── bus.py          # EventBus ABC (publish, subscribe)
│   │   │   │   ├── redis_streams.py # Redis Streams impl (backoff, DLQ)
│   │   │   │   ├── consumer.py     # Consumer runner (graceful shutdown, health)
│   │   │   │   ├── health.py       # HTTP health endpoint for Docker
│   │   │   │   └── handlers/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── extractor.py    # memory:raw → memory:extracted
│   │   │   │       ├── scorer.py       # memory:extracted → memory:scored
│   │   │   │       └── embedder.py     # memory:scored → Qdrant + PostgreSQL
│   │   │   │
│   │   │   ├── conversations/      # Conversation CRUD, message history
│   │   │   ├── connectors/         # External channels (Slack, Teams, etc.)
│   │   │   ├── mcp/                # MCP registry, sidecars, tool discovery
│   │   │   │
│   │   │   ├── sync/               # Sync module (consolidated)
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py       # POST /sync/push, /sync/agents, /sync/graphs, /sync/layers
│   │   │   │   ├── manifest_router.py  # GET/POST /manifest (moved from old manifest/)
│   │   │   │   ├── service.py      # Apply config changes + manifest logic
│   │   │   │   └── schemas.py      # Sync payload schemas (versioned)
│   │   │   │
│   │   │   ├── report/             # NOUVEAU - Report back to Studio
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py       # GET /report/{metrics,status,logs}
│   │   │   │   └── service.py
│   │   │   │
│   │   │   ├── workers/            # Celery tasks (executions, models, fine-tuning)
│   │   │   │
│   │   │   ├── admin/              # Admin user management
│   │   │   ├── groups/             # User groups, RBAC
│   │   │   ├── internal/           # Protected dashboard endpoints (monitoring, etc.)
│   │   │   └── fine_tuning/        # Datasets, jobs, experiments
│   │   │
│   │   ├── seed/                   # Seed data (68 agent + 3 graph templates)
│   │   │   ├── agents/             # Agent YAML templates
│   │   │   └── graphs/             # Graph YAML templates
│   │   │
│   │   ├── alembic/                # DB migrations (revision prefix: engine_)
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
│   ├── chat/                       # Vite + React - UI end-user
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
│   │   │       └── api/            # Utilise @modularmind/api-client
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── Dockerfile              # Multi-stage via turbo prune
│   │   └── package.json
│   │
│   └── ops/                        # Next.js - Console admin
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/
│       │   │   │   ├── login/
│       │   │   │   └── setup/
│       │   │   └── (dashboard)/
│       │   │       ├── layout.tsx
│       │   │       ├── page.tsx         # Dashboard home
│       │   │       ├── agents/          # Agent list + detail (read-only)
│       │   │       ├── graphs/          # Graph viewer (read-only)
│       │   │       ├── models/          # Model catalog + pull
│       │   │       ├── monitoring/      # Metrics, infra, celery, GPU, pipeline health
│       │   │       ├── configuration/   # Providers, MCP servers, integrations, system
│       │   │       ├── knowledge/       # RAG collections, documents, memory, search
│       │   │       ├── playground/      # Agent/graph test execution + trace
│       │   │       ├── users/           # User management + detail
│       │   │       └── fine-tuning/     # Datasets, jobs, experiments, curation
│       │   ├── components/
│       │   │   ├── monitoring/      # MetricsCharts, InfraStatus, LogViewer, PipelineHealth
│       │   │   ├── configuration/   # ProvidersTab, McpTab, IntegrationsTab
│       │   │   ├── knowledge/       # DocumentsTab, MemoryTab, SearchTab
│       │   │   ├── fine-tuning/     # JobCard, DatasetTable, ExperimentChart
│       │   │   ├── users/           # UserDetail, TokenUsage, etc.
│       │   │   ├── agents/          # Agent detail view (read-only)
│       │   │   ├── graphs/          # Graph viewer (read-only)
│       │   │   ├── playground/      # Playground chat, params, trace display
│       │   │   └── shared/          # PageHeader, Pagination, EmptyState, ResourceTable, etc.
│       │   ├── hooks/
│       │   ├── lib/
│       │   │   └── api/             # Utilise @modularmind/api-client
│       │   └── stores/
│       ├── next.config.ts           # basePath: '/ops'
│       ├── Dockerfile               # Multi-stage via turbo prune
│       └── package.json
│
├── packages/                       # Code partage (monorepo)
│   ├── api-client/                 # Types + client API TypeScript partage
│   │   ├── src/
│   │   │   ├── client.ts           # Base HTTP client (HttpOnly cookies, refresh mutex)
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
│   │   ├── package.json            # @modularmind/api-client
│   │   └── tsconfig.json
│   │
│   └── ui/                         # Composants shadcn/ui partages
│       ├── src/
│       │   ├── components/
│       │   │   ├── button.tsx
│       │   │   ├── card.tsx
│       │   │   ├── dialog.tsx
│       │   │   ├── dropdown-menu.tsx
│       │   │   ├── input.tsx
│       │   │   ├── tabs.tsx
│       │   │   ├── tooltip.tsx
│       │   │   ├── badge.tsx
│       │   │   ├── avatar.tsx
│       │   │   ├── select.tsx
│       │   │   ├── separator.tsx
│       │   │   ├── slider.tsx
│       │   │   ├── switch.tsx
│       │   │   ├── textarea.tsx
│       │   │   └── label.tsx
│       │   ├── lib/
│       │   │   └── utils.ts         # cn() helper, etc.
│       │   └── index.ts
│       ├── package.json            # @modularmind/ui
│       └── tsconfig.json
│
├── shared/                         # Python shared — INSTALLABLE PACKAGE
│   ├── pyproject.toml              # name: "modularmind-shared"
│   ├── src/
│   │   └── modularmind_shared/
│   │       ├── __init__.py
│   │       ├── protocols/
│   │       │   ├── __init__.py
│   │       │   ├── runtime.py
│   │       │   └── sync.py
│   │       └── schemas/
│   │           ├── __init__.py
│   │           ├── agents.py
│   │           ├── graphs.py
│   │           ├── collections.py
│   │           └── sync.py
│   └── tests/
│
├── docker/
│   ├── docker-compose.yml          # Deploiement client (engine + apps + infra)
│   ├── docker-compose.studio.yml   # Deploiement studio (owner)
│   ├── docker-compose.dev.yml      # Dev local (tout ensemble)
│   └── nginx/
│       ├── client.conf             # Reverse proxy client (single domain)
│       └── studio.conf             # Reverse proxy studio
│
├── turbo.json                      # Turborepo config
├── pnpm-workspace.yaml             # pnpm workspace definition
├── package.json                    # Root package.json
├── Makefile                        # Dev commands
├── CLAUDE.md                       # Project instructions (a mettre a jour)
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

GET    /api/v1/agents                        # Liste agents deployes
GET    /api/v1/agents/:id
GET    /api/v1/graphs                        # Liste graphs deployes
GET    /api/v1/graphs/:id

POST   /api/v1/conversations                 # Creer conversation
GET    /api/v1/conversations                 # Lister
GET    /api/v1/conversations/:id             # Detail + messages
POST   /api/v1/conversations/:id/messages    # Envoyer message
DELETE /api/v1/conversations/:id

POST   /api/v1/executions                    # Lancer execution
GET    /api/v1/executions/:id                # Status
GET    /api/v1/executions/:id/stream         # SSE streaming (tokens, traces, complete/error)

GET    /api/v1/models                        # Liste modeles disponibles

POST   /api/v1/rag/search                    # Search dans les collections
GET    /api/v1/rag/collections               # Liste collections

GET    /api/v1/memory/:agent_id              # Memoire d'un agent

GET    /health                               # Health check
```

### 4.2 Routes admin (Ops Console uniquement — RBAC role ADMIN/OWNER)

```
# Monitoring
GET    /api/v1/internal/monitoring            # Metrics systeme
GET    /api/v1/internal/monitoring/celery      # Status Celery
GET    /api/v1/internal/monitoring/gpu         # GPU/VRAM
GET    /api/v1/internal/monitoring/pipeline    # Pipeline Redis Streams health
GET    /api/v1/internal/logs/stream            # SSE log streaming (remplace ancien polling)
GET    /api/v1/internal/logs                   # Log history (paginated)

# Configuration
GET    /api/v1/internal/settings               # Lire settings
PATCH  /api/v1/internal/settings               # Modifier (API keys, etc.)
GET    /api/v1/internal/providers              # Provider config

# Actions admin
POST   /api/v1/internal/actions/restart        # Restart workers
POST   /api/v1/internal/actions/purge          # Purge queues

# Alerts
GET    /api/v1/internal/alerts
POST   /api/v1/internal/alerts
PATCH  /api/v1/internal/alerts/:id

# MCP
GET    /api/v1/internal/mcp/servers            # Liste MCP servers
POST   /api/v1/internal/mcp/servers            # Ajouter
DELETE /api/v1/internal/mcp/servers/:id        # Supprimer
GET    /api/v1/mcp/tools                       # Liste tools disponibles

# Users
GET    /api/v1/admin/users
POST   /api/v1/admin/users
PATCH  /api/v1/admin/users/:id
GET    /api/v1/admin/users/:id/stats

# Groups
GET    /api/v1/groups
POST   /api/v1/groups
PATCH  /api/v1/groups/:id

# RAG admin
POST   /api/v1/rag/collections                 # Creer collection
DELETE /api/v1/rag/collections/:id
POST   /api/v1/rag/collections/:id/documents   # Upload documents
DELETE /api/v1/rag/documents/:id

# Memory admin
GET    /api/v1/memory                          # Toutes les memoires
DELETE /api/v1/memory/:id                      # Supprimer memoire

# Models admin (pull = admin only, risque DoS)
POST   /api/v1/models/pull                     # Pull modele Ollama
GET    /api/v1/models/pull/:task_id/stream     # SSE pull progress (%, speed, ETA)
POST   /api/v1/models                          # Ajouter modele
DELETE /api/v1/models/:id                      # Retirer modele

# Fine-tuning
GET    /api/v1/fine-tuning/datasets
POST   /api/v1/fine-tuning/datasets
GET    /api/v1/fine-tuning/jobs
POST   /api/v1/fine-tuning/jobs
GET    /api/v1/fine-tuning/experiments

# Supervisor config
GET    /api/v1/internal/supervisor/layers
PATCH  /api/v1/internal/supervisor/layers/:name

# Playground (test execution)
POST   /api/v1/internal/playground/execute     # Lancer test agent/graph
GET    /api/v1/internal/playground/traces       # Historique traces

# Recall testing
POST   /api/v1/recall/run
GET    /api/v1/recall/results
```

### 4.3 Routes sync (Studio → Engine)

Toute la synchro est consolidee dans un seul module `sync/` cote Engine.
L'ancien `manifest/router.py` est absorbe dans ce module.

```
# Push configs depuis le Studio
POST   /api/v1/sync/push                      # Push manifest complet
POST   /api/v1/sync/agents                    # Push agent configs
POST   /api/v1/sync/graphs                    # Push graph configs
POST   /api/v1/sync/layers                    # Push prompt layers
POST   /api/v1/sync/reload                    # Force reload configs

# Manifest (ex-manifest/ module, deplace ici)
GET    /api/v1/sync/manifest                   # Get current manifest
POST   /api/v1/sync/manifest                   # Update manifest

# Authentification: HMAC signature sur le body
# Header: X-Sync-Signature: sha256=<hmac>
# Header: X-Sync-Timestamp: <unix_ts>
# Header: X-Sync-Spec-Version: 1          ← versioning du format
```

### Sync versioning contract

Chaque payload sync inclut un champ `spec_version` :

```python
class SyncPayload(BaseModel):
    spec_version: int = 1  # Increment quand le schema change
    timestamp: datetime
    resources: dict       # agents, graphs, layers, etc.
```

L'Engine refuse les payloads dont le `spec_version` est superieur a ce qu'il
supporte et retourne `422 Unprocessable Entity` avec un message explicite.
Ceci evite qu'un Studio V3 pousse un format incompatible vers un Engine V2.

### 4.4 Routes report (Engine → Studio, le Studio pull)

```
GET    /api/v1/report/status                  # Etat de sante (up, version, uptime)
GET    /api/v1/report/metrics                 # Metriques d'usage (conversations, executions, tokens)
GET    /api/v1/report/metrics/agents          # Usage par agent
GET    /api/v1/report/logs                    # Logs recents
GET    /api/v1/report/models                  # Modeles deployes + status
GET    /api/v1/report/pipeline                # Etat du pipeline memoire

# Authentification: meme HMAC que le sync
```

### 4.5 Webhooks entrants (externe → Engine)

```
POST   /webhooks/slack                         # Slack events
POST   /webhooks/teams                         # Teams events
POST   /webhooks/discord                       # Discord events
POST   /webhooks/email                         # Email webhooks
POST   /webhooks/custom/:connector_id          # Custom webhooks
```

---

## 5. Memory Pipeline (Redis Streams)

### 5.1 Contexte

Dans le codebase actuel, l'extraction de faits est deja **asynchrone** — elle
tourne dans un Celery task (`workers/tasks.py`) apres l'execution, pas dans le
supervisor. Le supervisor est un pur routeur sans effets de bord sur la memoire.

L'extraction est aussi **opt-in** via `FACT_EXTRACTION_ENABLED` (defaut: false).

Le pipeline V2 remplace ce Celery task unique par une chaine de workers
event-driven plus granulaire.

### 5.2 Architecture

```
Execution terminee (Celery task process_ended_conversation)
       │
       │  Au lieu de : await fact_extractor.extract(...)
       │  Maintenant : await event_bus.publish("memory:raw", ...)
       │
       ▼
  ┌─────────────────────────────────────────────────┐
  │  Stream: memory:raw                              │
  │  Consumer Group: extractors                      │
  │                                                  │
  │  HANDLER: Extractor                              │
  │  • Input: raw messages                           │
  │  • Process: LLM leger (Haiku / petit Ollama)     │
  │  • Output: liste de faits, entites, relations    │
  │  • XADD memory:extracted { facts[], agent_id }   │
  │  • XACK memory:raw                               │
  │  • On failure apres 3 retries:                   │
  │    XADD memory:dlq { original_msg, error, ts }   │
  └──────────────────┬──────────────────────────────┘
                     ▼
  ┌─────────────────────────────────────────────────┐
  │  Stream: memory:extracted                        │
  │  Consumer Group: scorers                         │
  │                                                  │
  │  HANDLER: Scorer                                 │
  │  • Input: extracted facts                        │
  │  • Process: LLM leger + heuristiques             │
  │    - Importance (0-1)                            │
  │    - Novelty: est-ce deja connu ?                │
  │    - Relevance: pertinence pour l'agent          │
  │  • Filter: score < 0.3 → drop (XACK sans emit)  │
  │  • XADD memory:scored { facts + scores }         │
  │  • XACK memory:extracted                         │
  └──────────────────┬──────────────────────────────┘
                     ▼
  ┌─────────────────────────────────────────────────┐
  │  Stream: memory:scored                           │
  │  Consumer Group: embedders                       │
  │                                                  │
  │  HANDLER: Embedder                               │
  │  • Input: scored facts                           │
  │  • Process:                                      │
  │    - Generate embedding (Ollama nomic-embed-text)│
  │    - Upsert → Qdrant (collection: memory)        │
  │    - Insert → PostgreSQL (metadata, scores)      │
  │  • XACK memory:scored                            │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │  Stream: memory:dlq  (Dead Letter Queue)         │
  │  • Messages qui ont echoue apres max retries     │
  │  • Consultable via l'Ops Console                 │
  │  • Rejouable manuellement                        │
  └─────────────────────────────────────────────────┘

  Celery Beat (every 6h):
  ┌─────────────────────────────────────────────────┐
  │  TASK: memory.consolidate                        │
  │                                                  │
  │  • Fusionne faits redondants (cosine similarity) │
  │  • Applique decay temporel aux scores            │
  │  • Prune memoires score < 0.1                    │
  │  • Met a jour Qdrant + PostgreSQL                │
  └─────────────────────────────────────────────────┘
```

### 5.3 EventBus Interface

```python
# engine/server/src/pipeline/bus.py

from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any, Callable, Awaitable

class EventBus(ABC):
    """Abstraction pour le transport d'evenements.
    Implementation actuelle: Redis Streams.
    Future possible: Redpanda/Kafka.
    """

    @abstractmethod
    async def publish(self, stream: str, data: dict[str, Any]) -> str:
        """Publie un evenement. Retourne le message ID."""
        ...

    @abstractmethod
    async def subscribe(
        self,
        stream: str,
        group: str,
        consumer: str,
        handler: Callable[[dict[str, Any]], Awaitable[None]],
        max_retries: int = 3,
    ) -> None:
        """Consomme des evenements en boucle (consumer group).
        Apres max_retries echecs, le message est envoye dans la DLQ.
        """
        ...

    @abstractmethod
    async def ensure_group(self, stream: str, group: str) -> None:
        """Cree le consumer group s'il n'existe pas."""
        ...

    @abstractmethod
    async def stream_info(self, stream: str) -> dict[str, Any]:
        """Retourne les metriques du stream (length, pending, consumers)."""
        ...
```

### 5.4 Redis Streams Implementation

```python
# engine/server/src/pipeline/redis_streams.py

import asyncio
import structlog
from redis.asyncio import Redis
from redis.exceptions import ResponseError

logger = structlog.get_logger()

DLQ_STREAM = "memory:dlq"
INITIAL_BACKOFF = 1.0   # seconds
MAX_BACKOFF = 30.0       # seconds


class RedisStreamBus(EventBus):
    def __init__(self, redis: Redis):
        self.redis = redis
        self._running = True

    def stop(self):
        """Signal graceful shutdown."""
        self._running = False

    async def publish(self, stream: str, data: dict) -> str:
        return await self.redis.xadd(stream, data)

    async def subscribe(self, stream, group, consumer, handler, max_retries=3):
        await self.ensure_group(stream, group)
        backoff = INITIAL_BACKOFF

        while self._running:
            try:
                messages = await self.redis.xreadgroup(
                    groupname=group,
                    consumername=consumer,
                    streams={stream: ">"},
                    count=10,
                    block=5000,
                )
                backoff = INITIAL_BACKOFF  # reset on success

                for stream_name, entries in messages:
                    for msg_id, data in entries:
                        retry_count = int(data.get(b"_retry_count", 0))
                        try:
                            await handler(data)
                            await self.redis.xack(stream, group, msg_id)
                        except Exception:
                            logger.exception(
                                "handler_failed",
                                stream=stream,
                                msg_id=msg_id,
                                retry=retry_count,
                            )
                            if retry_count >= max_retries:
                                # Send to Dead Letter Queue
                                await self.redis.xadd(DLQ_STREAM, {
                                    b"original_stream": stream,
                                    b"original_id": msg_id,
                                    b"error": str(retry_count) + " retries exhausted",
                                    b"data": str(data),
                                    b"timestamp": datetime.now(UTC).isoformat(),
                                })
                                await self.redis.xack(stream, group, msg_id)
                                logger.warning("message_sent_to_dlq", msg_id=msg_id)
                            else:
                                # Re-add with incremented retry count
                                data[b"_retry_count"] = str(retry_count + 1)
                                await self.redis.xadd(stream, data)
                                await self.redis.xack(stream, group, msg_id)

            except (ConnectionError, OSError):
                logger.warning("redis_connection_lost", backoff=backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)

    async def ensure_group(self, stream, group):
        try:
            await self.redis.xgroup_create(stream, group, id="0", mkstream=True)
        except ResponseError:
            pass  # Group already exists

    async def stream_info(self, stream: str) -> dict:
        try:
            info = await self.redis.xinfo_stream(stream)
            groups = await self.redis.xinfo_groups(stream)
            return {
                "length": info.get("length", 0),
                "groups": [
                    {
                        "name": g["name"],
                        "pending": g["pending"],
                        "consumers": g["consumers"],
                        "last_delivered": g["last-delivered-id"],
                    }
                    for g in groups
                ],
            }
        except ResponseError:
            return {"length": 0, "groups": []}
```

### 5.5 Consumer runner (graceful shutdown + health)

```python
# engine/server/src/pipeline/consumer.py

import asyncio
import signal
import structlog
from .redis_streams import RedisStreamBus
from .health import start_health_server
from .handlers import extractor_handler, scorer_handler, embedder_handler

logger = structlog.get_logger()


async def main():
    redis = await get_redis()
    bus = RedisStreamBus(redis)

    # Graceful shutdown
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: bus.stop())

    # Health endpoint for Docker healthcheck
    health_task = asyncio.create_task(start_health_server(bus, port=8001))

    logger.info("pipeline_starting", streams=["memory:raw", "memory:extracted", "memory:scored"])

    try:
        # return_exceptions=True prevents one crash from killing all consumers
        results = await asyncio.gather(
            bus.subscribe("memory:raw", "extractors", "ext-1", extractor_handler),
            bus.subscribe("memory:extracted", "scorers", "scr-1", scorer_handler),
            bus.subscribe("memory:scored", "embedders", "emb-1", embedder_handler),
            return_exceptions=True,
        )
        # Log any consumer that exited with an exception
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("consumer_exited_with_error", consumer=i, error=str(result))
    finally:
        health_task.cancel()
        await redis.close()
        logger.info("pipeline_stopped")


if __name__ == "__main__":
    asyncio.run(main())
```

```python
# engine/server/src/pipeline/health.py

from aiohttp import web

async def start_health_server(bus, port=8001):
    """Minimal HTTP server for Docker healthcheck."""

    async def health(request):
        # Check Redis connectivity
        try:
            await bus.redis.ping()
            return web.json_response({"status": "healthy"})
        except Exception:
            return web.json_response({"status": "unhealthy"}, status=503)

    app = web.Application()
    app.router.add_get("/health", health)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
```

### 5.6 Integration avec le flow existant

Le traitement memoire est declenche dans `workers/tasks.py` par la task
`process_ended_conversation()`, **pas par le supervisor**. Le supervisor est un pur
routeur qui ne touche jamais a la memoire.

```python
# workers/tasks.py — dans process_ended_conversation()
# Remplace l'appel direct a fact_extractor par un publish

if settings.FACT_EXTRACTION_ENABLED:
    await event_bus.publish("memory:raw", {
        "conversation_id": str(conversation_id),
        "agent_id": agent_id,
        "user_id": str(user_id),
        "messages": json.dumps(serialize_messages(messages)),
        "timestamp": datetime.now(UTC).isoformat(),
    })
```

### 5.7 Pipeline monitoring (Ops Console)

L'Ops Console affiche l'etat du pipeline via `GET /api/v1/internal/monitoring/pipeline` :

- Nombre de messages pending par stream
- Lag entre production et consommation
- Messages en DLQ (avec option de replay)
- Etat des consumers (alive/dead)

---

## 6. Packages partages

### 6.1 @modularmind/api-client

Client API TypeScript partage entre Chat et Ops. Le pattern d'auth est
**HttpOnly cookies** (set par le login endpoint du Engine). Le client utilise
`credentials: 'include'` et ne manipule jamais le token directement.
Ceci fonctionne car nginx route tout sur le meme domaine.

```typescript
// packages/api-client/src/client.ts

export interface ApiClientConfig {
  /** Base path, e.g. '/api/v1' (same origin via nginx) */
  basePath: string;
  onUnauthorized?: () => void;
}

// Refresh mutex — prevents concurrent 401 refresh races
let refreshPromise: Promise<void> | null = null;

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    const res = await fetch(`${config.basePath}${path}`, {
      method,
      credentials: 'include',  // sends HttpOnly cookies
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401) {
      // Deduplicated token refresh
      if (!refreshPromise) {
        refreshPromise = fetch(`${config.basePath}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        }).then(r => {
          if (!r.ok) {
            config.onUnauthorized?.();
            throw new ApiError(401, 'Session expired');
          }
        }).finally(() => { refreshPromise = null; });
      }
      await refreshPromise;
      // Retry original request
      return request(method, path, options);
    }

    if (!res.ok) throw new ApiError(res.status, await res.json());
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
    // Admin-only modules (Ops Console)
    monitoring: createMonitoringApi(request),
    settings: createSettingsApi(request),
    admin: createAdminApi(request),
    mcp: createMcpApi(request),
    fineTuning: createFineTuningApi(request),
    playground: createPlaygroundApi(request),
  };
}
```

Utilisation dans Chat (Vite + React Router) :
```typescript
// apps/chat/src/lib/api.ts
import { createApiClient } from '@modularmind/api-client';

// Chat lives at /, uses react-router-dom for navigation.
// No basePath prefix needed — all routes are relative.
export const api = createApiClient({
  basePath: '/api/v1',    // nginx proxifie vers Engine
  onUnauthorized: () => {
    // Use react-router navigate — never window.location.href
    // This is set up in App.tsx where the router context exists:
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  },
});

// In App.tsx:
// useEffect(() => {
//   const handler = () => navigate('/login');
//   window.addEventListener('auth:unauthorized', handler);
//   return () => window.removeEventListener('auth:unauthorized', handler);
// }, [navigate]);
```

Utilisation dans Ops (Next.js, basePath='/ops') :
```typescript
// apps/ops/src/lib/api.ts
import { createApiClient } from '@modularmind/api-client';

// Ops uses basePath: '/ops' in next.config.ts.
// IMPORTANT: Never use window.location.href for navigation — it
// bypasses Next.js basePath. Use next/navigation's router.push()
// or redirect() instead.
export const api = createApiClient({
  basePath: '/api/v1',    // nginx proxifie vers Engine
  onUnauthorized: () => {
    // Same event-based pattern — the AuthProvider listens and
    // calls router.push('/login') which respects basePath.
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  },
});

// In AuthProvider.tsx:
// const router = useRouter();
// useEffect(() => {
//   const handler = () => router.push('/login'); // → /ops/login
//   window.addEventListener('auth:unauthorized', handler);
//   return () => window.removeEventListener('auth:unauthorized', handler);
// }, [router]);
```

### basePath migration checklist (Phase 3)

When migrating the current dashboard to the Ops Console, systematically replace
**every** `window.location.href = '...'` with router-based navigation :

| Pattern a remplacer | Remplacement |
|---------------------|-------------|
| `window.location.href = '/login'` | `router.push('/login')` (respecte basePath) |
| `window.location.href = '/setup'` | `router.push('/setup')` |
| `window.location.href = '/...'` (tout) | `router.push('/...')` ou `redirect('/...')` |
| `<a href="/models">` (hardcode) | `<Link href="/models">` (Next.js Link) |

Fichiers concernes dans le codebase actuel :
- `contexts/AuthContext.tsx` — redirect vers `/login` et `/setup`
- `components/dashboard/Sidebar.tsx` — liens de navigation hardcodes
- Tout fichier utilisant `window.location` pour naviguer

### 6.2 @modularmind/ui

Composants shadcn/ui partages. Les deux apps importent depuis ce package.

```typescript
import { Button, Card, Dialog, Tabs } from '@modularmind/ui';
```

---

## 7. Shared Python Package

L'ancien `shared/` utilise des hacks `sys.path` pour etre importe. En V2, c'est
un vrai package installable.

```toml
# shared/pyproject.toml
[project]
name = "modularmind-shared"
version = "1.0.0"
requires-python = ">=3.11"
dependencies = ["pydantic>=2.0.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/modularmind_shared"]
```

Installation dans Engine et Studio :

```toml
# engine/server/pyproject.toml
[project]
dependencies = [
    "modularmind-shared @ file:///${PROJECT_ROOT}/../shared",
    # ... autres deps
]

# En Docker, copier le package et installer
# COPY shared/ /tmp/shared/
# RUN pip install /tmp/shared/
```

Import propre :

```python
# Avant (hack):
from shared.schemas import AgentConfig

# Apres (propre):
from modularmind_shared.schemas import AgentConfig
```

### 7.1 SSE Streaming Utility

Le module `infra/sse.py` est la brique de streaming **unique** pour toute l'API.
Il remplace l'ancien `executions/websocket.py`. Tous les endpoints SSE l'utilisent :
executions, logs, model pull progress.

```python
# engine/server/src/infra/sse.py

import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Request
from fastapi.responses import StreamingResponse


async def sse_response(
    generator: AsyncGenerator[dict[str, Any], None],
    request: Request,
) -> StreamingResponse:
    """Wrap an async generator into a proper SSE StreamingResponse.

    Each yielded dict must have at least a "type" key (used as SSE event type).
    Optional "id" key becomes the SSE event id (enables Last-Event-ID replay).
    """

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
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
```

Exemple d'utilisation dans un endpoint d'execution :

```python
# engine/server/src/executions/router.py

from src.infra.sse import sse_response

@router.get("/{execution_id}/stream")
async def stream_execution(
    request: Request,
    execution_id: str,
    user: User = Depends(get_current_user),
    last_event_id: str | None = Header(None, alias="Last-Event-ID"),
):
    async def event_generator():
        # Replay missed events if reconnecting
        if last_event_id:
            missed = await replay_from_buffer(execution_id, after=last_event_id)
            for event in missed:
                yield event

        # Stream live events from Redis pub/sub
        async for event in redis_pubsub.listen(f"execution:{execution_id}"):
            yield event
            if event.get("type") in ("complete", "error"):
                break

    return await sse_response(event_generator(), request)
```

Cote client (Chat et Ops) — hook `useStreaming` :

```typescript
// packages/api-client/src/streaming.ts

export function useStreaming(executionId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done'>('idle');

  useEffect(() => {
    if (!executionId) return;
    setStatus('streaming');

    // SSE — cookies sent automatically, reconnection built-in
    const es = new EventSource(`/api/v1/executions/${executionId}/stream`);

    es.addEventListener('tokens', (e) => {
      setEvents(prev => [...prev, JSON.parse(e.data)]);
    });
    es.addEventListener('trace', (e) => {
      setEvents(prev => [...prev, JSON.parse(e.data)]);
    });
    es.addEventListener('complete', (e) => {
      setEvents(prev => [...prev, JSON.parse(e.data)]);
      setStatus('done');
      es.close();
    });
    es.addEventListener('error', (e) => {
      // SSE native error — browser will auto-reconnect unless we close
      if (es.readyState === EventSource.CLOSED) {
        setStatus('done');
      }
    });

    return () => es.close();
  }, [executionId]);

  return { events, status };
}
```

Le meme pattern `sse_response` sert pour les 3 endpoints SSE :

| Endpoint | Event types | Usage |
|----------|-------------|-------|
| `GET /api/v1/executions/:id/stream` | `tokens`, `trace`, `step`, `complete`, `error` | Chat + Playground |
| `GET /api/v1/internal/logs/stream` | `log` | Ops log viewer |
| `GET /api/v1/models/pull/:task_id/stream` | `progress`, `complete`, `error` | Ops model pull UI |

---

## 8. Nginx Configuration (single domain)

```nginx
# docker/nginx/client.conf

upstream engine {
    server engine:8000;
}

upstream chat {
    server chat:80;
}

upstream ops {
    server ops:3000;
}

server {
    listen 80;
    server_name _;

    # ── Engine API (REST + SSE streaming) ──
    # SSE endpoints (executions/stream, logs/stream, models/pull/stream)
    # work as plain HTTP GET — no WebSocket upgrade needed.
    # proxy_buffering off ensures SSE events are forwarded immediately.
    location /api/ {
        proxy_pass http://engine;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE: disable buffering so events stream through immediately
        proxy_buffering off;
        proxy_cache off;

        # Required for large file uploads (RAG documents)
        client_max_body_size 100M;
    }

    # ── Engine health ──
    location /health {
        proxy_pass http://engine;
    }

    # ── Webhooks ──
    location /webhooks/ {
        proxy_pass http://engine;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # ── Ops Console ──
    location /ops/ {
        proxy_pass http://ops;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── Chat (default, catch-all) ──
    # Le Chat est un SPA servi par son propre nginx interne.
    # Le fallback SPA (try_files → /index.html) est gere par le
    # nginx INTERNE du container Chat, pas ici. Ce proxy forward
    # simplement les requetes.
    location / {
        proxy_pass http://chat;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 9. Docker Compose (deploiement client)

```yaml
# docker/docker-compose.yml

# ── YAML Anchors: variables partagees entre les 4 services Engine ──
# Une seule definition, zero duplication. Toute modification s'applique partout.
x-engine-env: &engine-env
  DATABASE_URL: postgresql+asyncpg://${DB_USER:-modularmind}:${DB_PASSWORD}@db:5432/modularmind
  REDIS_URL: redis://redis:6379/0
  QDRANT_URL: http://qdrant:6333
  OLLAMA_BASE_URL: http://ollama:11434
  SECRET_KEY: ${SECRET_KEY}

x-engine-depends: &engine-depends
  db: { condition: service_healthy }
  redis: { condition: service_healthy }
  qdrant: { condition: service_healthy }

services:
  # ── Infrastructure ──
  db:
    image: postgres:16-alpine
    volumes:
      - postgres-data:/var/lib/postgresql/data
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
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  qdrant:
    image: qdrant/qdrant:v1.13.0
    volumes:
      - qdrant-data:/qdrant/storage
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:6333/readyz"]
      interval: 10s

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-data:/root/.ollama
    profiles: [ollama]

  # ── Engine (single image, 4 services) ──
  # On build UNE SEULE image `modularmind/engine:latest`.
  # Les 3 autres services la reutilisent via `image:` — zero rebuild.
  engine:
    build:
      context: ..
      dockerfile: engine/server/Dockerfile
    image: modularmind/engine:latest    # tag l'image pour reutilisation
    depends_on: *engine-depends
    environment:
      <<: *engine-env
      SYNC_HMAC_SECRET: ${SYNC_HMAC_SECRET}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 5s
      retries: 3

  celery-worker:
    image: modularmind/engine:latest    # reutilise l'image engine
    command: celery -A src.workers.celery_app worker -Q default,executions,models,fine_tuning -c 4
    depends_on: *engine-depends
    environment: *engine-env
    healthcheck:
      test: ["CMD", "celery", "-A", "src.workers.celery_app", "inspect", "ping"]
      interval: 30s
      timeout: 10s

  celery-beat:
    image: modularmind/engine:latest    # reutilise l'image engine
    command: celery -A src.workers.celery_app beat
    depends_on:
      redis: { condition: service_healthy }
    environment:
      REDIS_URL: redis://redis:6379/0

  pipeline-worker:
    image: modularmind/engine:latest    # reutilise l'image engine
    command: python -m src.pipeline.consumer
    depends_on: *engine-depends
    environment: *engine-env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 15s
      timeout: 5s
      retries: 3

  # ── Apps ──
  chat:
    build:
      context: ..
      dockerfile: apps/chat/Dockerfile
    profiles: [chat]

  ops:
    build:
      context: ..
      dockerfile: apps/ops/Dockerfile
    profiles: [ops]
    environment:
      # Internal routing only (server-side fetch from Ops → Engine)
      ENGINE_INTERNAL_URL: http://engine:8000

  # ── Reverse Proxy (single domain) ──
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/client.conf:/etc/nginx/conf.d/default.conf
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    depends_on:
      - engine

volumes:
  postgres-data:
  redis-data:
  qdrant-data:
  ollama-data:
```

### Docker image strategy

L'Engine utilise **une seule image Docker** (`modularmind/engine:latest`) pour 4 services :
- `engine` : FastAPI HTTP server (build + tag)
- `celery-worker` : Celery task execution (reutilise via `image:`)
- `celery-beat` : Periodic task scheduler (reutilise via `image:`)
- `pipeline-worker` : Memory pipeline consumer (reutilise via `image:`)

Avantages :
- **Un seul build** au lieu de 4 builds identiques
- **YAML anchors** (`&engine-env`, `&engine-depends`) eliminent la duplication d'env vars
- `docker compose build` ne build que 3 images au total : engine, chat, ops

### Docker builds avec turbo prune

Les Dockerfiles des apps TS utilisent `turbo prune` pour generer un contexte
minimal. Ceci resout le probleme du lockfile monorepo.

```dockerfile
# apps/chat/Dockerfile (exemple, meme pattern pour ops)

# 1. Prune: extract only chat + its dependencies
FROM node:22-alpine AS pruner
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @modularmind/chat --docker

# 2. Install deps from pruned lockfile
FROM node:22-alpine AS installer
RUN corepack enable
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# 3. Build
FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@modularmind/chat

# 4. Serve static files
FROM nginx:alpine
COPY --from=builder /app/apps/chat/dist /usr/share/nginx/html
COPY apps/chat/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Le Docker context est la **racine du monorepo** (`context: ..`), ce qui
permet a `turbo prune` d'acceder aux packages et au lockfile.

### Commandes de deploiement

```bash
# Client: tout lancer
docker compose --profile chat --profile ops up -d

# Client: engine + chat seulement
docker compose --profile chat up -d

# Client: avec Ollama local
docker compose --profile chat --profile ops --profile ollama up -d
```

---

## 10. Turborepo Configuration

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "studio/frontend"
```

```jsonc
// package.json (root)
{
  "name": "modularmind-v2",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "dev:chat": "turbo dev --filter=@modularmind/chat",
    "dev:ops": "turbo dev --filter=@modularmind/ops",
    "dev:studio": "turbo dev --filter=@modularmind/studio-frontend",
    "build:chat": "turbo build --filter=@modularmind/chat",
    "build:ops": "turbo build --filter=@modularmind/ops"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

---

## 11. Migration mapping (ancien → nouveau)

| Ancien | Nouveau | Action |
|--------|---------|--------|
| `backend/src/` | `studio/backend/src/` | Copier, adapter sync (push au lieu de poll) |
| `backend/alembic/` | `studio/backend/alembic/` | Copier, prefixer revisions `studio_` |
| `frontend/src/` | `studio/frontend/src/` | Copier tel quel |
| `runtime/server/src/` | `engine/server/src/` | Copier, consolider manifest/ dans sync/, supprimer websocket.py |
| `runtime/server/src/executions/websocket.py` | *(supprime)* | Remplace par `infra/sse.py` (SSE au lieu de WebSocket) |
| `runtime/server/src/manifest/` | `engine/server/src/sync/manifest_router.py` | Absorber dans le module sync |
| `runtime/server/tests/` | `engine/server/tests/` | Copier, adapter imports |
| `runtime/server/seed/` | `engine/server/seed/` | Copier les 68 agents + 3 graphs templates |
| `runtime/dashboard/src/components/chat/` | `apps/chat/src/components/` | Adapter pour Vite |
| `runtime/dashboard/src/app/(dashboard)/chat/` | `apps/chat/src/pages/Chat.tsx` | Reecrire pour React Router |
| `runtime/dashboard/src/app/(dashboard)/*` (sauf chat) | `apps/ops/src/app/` | Copier, retirer chat, ajouter basePath /ops |
| `runtime/dashboard/src/components/playground/` | `apps/ops/src/components/playground/` | Copier tel quel |
| `runtime/dashboard/src/components/*` (sauf chat) | `apps/ops/src/components/` | Copier tel quel |
| `runtime/dashboard/src/components/ui/` | `packages/ui/src/components/` | Extraire en package partage |
| `runtime/dashboard/src/lib/api/runtime-client.ts` | `packages/api-client/src/client.ts` | Refactor: cookies same-origin, refresh mutex |
| `runtime/dashboard/src/lib/api/*.ts` | `packages/api-client/src/` | Extraire types + fonctions API |
| `runtime/dashboard/src/lib/types/` | `packages/api-client/src/types/` | Copier |
| `runtime/mcp-sidecars/` | `engine/mcp-sidecars/` | Copier tel quel |
| `runtime/sync-service/` | *(supprime)* | Remplace par Engine sync/ endpoints |
| `shared/` + `runtime/shared/` | `shared/` (package installable) | Fusionner, restructurer en modularmind_shared |
| `docker-compose.yml` | `docker/docker-compose.yml` | Reecrire (single domain nginx) |
| `nginx/` | `docker/nginx/` | Reecrire (client.conf avec routing unifie) |
| `docs/` | `docs/` | Copier + ajouter cette spec |
| `Makefile` | `Makefile` | Adapter commandes |
| `CLAUDE.md` | `CLAUDE.md` | Reecrire pour V2 |

---

## 12. Ce qui est NOUVEAU (n'existe pas aujourd'hui)

| Composant | Description |
|-----------|------------|
| `engine/server/src/infra/sse.py` | SSE response utility (remplace websocket.py) |
| `engine/server/src/pipeline/` | Memory pipeline event-driven (Redis Streams) |
| `engine/server/src/pipeline/bus.py` | EventBus abstraction |
| `engine/server/src/pipeline/redis_streams.py` | Redis Streams impl (backoff, DLQ, retry) |
| `engine/server/src/pipeline/consumer.py` | Consumer runner (graceful shutdown, health) |
| `engine/server/src/pipeline/health.py` | Health HTTP endpoint pour Docker |
| `engine/server/src/pipeline/handlers/` | Extractor, Scorer, Embedder workers |
| `engine/server/src/sync/` | Module sync consolide (push + manifest) |
| `engine/server/src/report/` | Endpoints reporting vers Studio |
| `apps/chat/` | App chat complete (Vite + React) |
| `packages/api-client/` | Package TypeScript partage (HttpOnly cookies) |
| `packages/ui/` | Package composants partage |
| `shared/pyproject.toml` | Package Python installable |
| `docker/nginx/client.conf` | Reverse proxy single domain |
| `turbo.json` | Config Turborepo |
| `pnpm-workspace.yaml` | Config workspaces |
| Pipeline worker Docker service | Nouveau container avec healthcheck |
| Pipeline monitoring (Ops) | Vue des streams Redis, DLQ, lag |
| `studio/backend/src/sync/models.py` | `PendingSyncPush` model (offline queue pour retries) |
| Sync versioning contract | `spec_version` dans les payloads sync |
| SSE streaming (3 endpoints) | Executions, logs, model pull — remplace WebSocket |
| Docker YAML anchors | `x-engine-env`, `x-engine-depends` — zero duplication |
| Single Docker image reuse | `modularmind/engine:latest` build une fois, reutilise 4x |

---

## 13. Client onboarding

Le client recoit :

1. Un `docker-compose.yml` pre-configure
2. Un `.env.example` a remplir (DB password, SECRET_KEY, SYNC_HMAC_SECRET)
3. Un script `setup.sh` qui genere les secrets et lance le premier `docker compose up`
4. L'acces au setup wizard (`/ops/setup`) pour creer le premier user OWNER

Les images Docker sont pre-build et publiees sur un registry prive
(GitHub Container Registry ou Docker Hub prive). Le client ne build rien.

```bash
# Onboarding client
curl -O https://registry.example.com/modularmind/docker-compose.yml
curl -O https://registry.example.com/modularmind/.env.example
cp .env.example .env
# Editer .env avec les valeurs
docker compose --profile chat --profile ops up -d
# Aller sur http://localhost/ops/setup
```
