# Architecture globale — ModularMind V2

## Vue d'ensemble

ModularMind est une plateforme d'orchestration d'agents IA composée de trois couches principales : les applications clientes (Chat, Ops), le moteur d'exécution (Engine), et la plateforme d'administration (Platform).

## Diagramme d'architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                       │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │   Chat SPA   │  │   Ops SPA    │  │      Platform (Next.js)     │ │
│  │  Vite+React  │  │  Vite+React  │  │   Admin + Studio + Marketing│ │
│  │  Port 5173   │  │  Port 5174   │  │       Port 3000             │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────────┘ │
│         │                  │                        │                 │
│         └──────────────────┼────────────────────────┘                 │
│                            │                                          │
│                     @modularmind/ui (shadcn components)               │
│                     @modularmind/api-client (typed HTTP)              │
└────────────────────────────┼─────────────────────────────────────────┘
                             │
                      ┌──────┴──────┐
                      │    Nginx    │
                      │  (Reverse   │
                      │   Proxy)    │
                      └──────┬──────┘
                             │
┌────────────────────────────┼─────────────────────────────────────────┐
│                        ENGINE                                        │
│                                                                       │
│  ┌─────────────────────────┴─────────────────────────────────────┐   │
│  │                    FastAPI Server (Engine)                      │   │
│  │                                                                 │   │
│  │  ┌─────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────────┐│   │
│  │  │  Auth   │ │Conversations│ │ Executions│ │  Graph Engine    ││   │
│  │  │  JWT    │ │  Messages   │ │   SSE     │ │  LangGraph       ││   │
│  │  └─────────┘ └────────────┘ └──────────┘ └──────────────────┘│   │
│  │  ┌─────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────────┐│   │
│  │  │   RAG   │ │   Memory   │ │   MCP    │ │  LLM Providers   ││   │
│  │  │Pipeline │ │  System    │ │  Tools   │ │ Ollama/OAI/Claude ││   │
│  │  └─────────┘ └────────────┘ └──────────┘ └──────────────────┘│   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    Worker Process                              │   │
│  │                                                                 │   │
│  │  Redis Streams Consumer          APScheduler                    │   │
│  │  ├─ tasks:documents              ├─ Model health checks (5min) │   │
│  │  ├─ tasks:models                 ├─ Memory consolidation (1h)  │   │
│  │  ├─ memory:raw                   ├─ Metric reporting (15min)   │   │
│  │  └─ memory:extracted             └─ Cache cleanup (6h)         │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────────┐
│                      INFRASTRUCTURE                                   │
│                                                                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │
│  │ PostgreSQL │  │   Redis    │  │   Qdrant   │  │     Ollama     │ │
│  │            │  │            │  │            │  │                │ │
│  │ Users      │  │ Cache      │  │ knowledge  │  │ LLM Models     │ │
│  │ Agents     │  │ Sessions   │  │ (RAG)      │  │ Embedding      │ │
│  │ Graphs     │  │ Rate Limit │  │ memory     │  │ Models         │ │
│  │ Convos     │  │ Streams    │  │ (memories) │  │                │ │
│  │ RAG Docs   │  │ Pub/Sub    │  │            │  │                │ │
│  │ Memory     │  │            │  │            │  │                │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Flux de données

### Flux d'un message utilisateur

1. L'utilisateur envoie un message via l'interface Chat
2. Le message est envoyé en POST à `/conversations/{id}/messages`
3. L'Engine identifie l'agent et charge sa configuration
4. Si un graphe est assigné, le **Graph Engine** compile et exécute le workflow :
   a. **RAG Node** : recherche sémantique dans les collections autorisées
   b. **Memory Node** : rappel des souvenirs pertinents de l'utilisateur
   c. **LLM Node** : appel au provider LLM avec le contexte enrichi
   d. **Tool Node** : exécution d'outils MCP si l'agent le demande
5. La réponse est streamée via SSE au client
6. En parallèle, un événement `memory:raw` est publié sur Redis Streams
7. Le Worker extrait les faits de la conversation (LLM fact extraction)
8. Les faits extraits sont vectorisés et stockés dans Qdrant + PostgreSQL

### Flux de synchronisation Platform → Engine

1. Le Platform définit les agents, graphes et collections via l'interface Studio
2. L'Engine poll `GET /api/sync/manifest` avec le header `X-Engine-Key`
3. Le manifest contient les versions de chaque configuration
4. L'Engine télécharge les configurations modifiées et les stocke dans sa DB
5. Le `ConfigProvider` sert les configurations aux modules Engine

## Stack technique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Chat/Ops SPA | React + Vite + TypeScript | Rapidité de dev, HMR instantané |
| Platform | Next.js 16 + App Router | SSR pour le SEO, API routes intégrées |
| Engine API | FastAPI + Python 3.12 | Performance async, écosystème ML |
| Worker | Redis Streams + APScheduler | Simplicité, pas de Celery |
| Base de données | PostgreSQL 16 | Fiabilité, JSON support, extensions |
| Cache/Queue | Redis 7 | Cache, sessions, streams, pub/sub |
| Vector Store | Qdrant | Hybrid search, self-hostable, Rust |
| LLM local | Ollama | Multi-modèle, GPU management |
| UI Components | shadcn/ui + Tailwind v4 | Personnalisable, accessible |
| Auth | JWT (Engine) / next-auth (Platform) | Stateless, scalable |

## Principes d'architecture

1. **Pas de WebSocket** — SSE uniquement pour le streaming (simplicité infra)
2. **Pas de Celery** — Redis Streams pour le background processing
3. **Multi-provider LLM** — Abstraction provider pour switch transparent
4. **Config-driven** — Les agents et graphes sont des configurations, pas du code
5. **Scope-based ACL** — Contrôle d'accès granulaire (Global, Group, Agent)
6. **Event-driven memory** — Pipeline asynchrone pour l'extraction de mémoire
