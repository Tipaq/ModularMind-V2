# ModularMind V2 - Plan de Migration

> Plan d'execution phase par phase.
> Reference: [spec.md](spec.md)
> Revise le 2026-02-27.

---

## Strategie de rollback

L'ancien repo (`ModularMind-IA`) reste **operationnel et deployable** pendant
toute la migration. Il n'est archive qu'apres 2 semaines de stabilite en
production sur le V2.

- Tag `v1-final` sur l'ancien repo avant de commencer
- L'ancien repo garde ses Docker images fonctionnelles
- En cas de probleme critique sur V2 : redeployer V1 en une commande

---

## Phase 0 : Setup du nouveau repo

**Objectif**: Repo fonctionnel avec structure cible, CI de base, tooling configure.

### 0.1 Tagger l'ancien repo

```bash
cd ModularMind-IA
git tag v1-final
git push origin v1-final
```

### 0.2 Creer le repo et la structure

Deja fait. Voir `ModularMind-V2/` sur GitHub.

### 0.3 Initialiser le monorepo TypeScript

```bash
pnpm init
pnpm add -Dw turbo
# turbo.json, pnpm-workspace.yaml, package.json root
```

### 0.4 Initialiser chaque package

```bash
# apps/chat — Vite + React
cd apps/chat && pnpm create vite . --template react-ts
# → @modularmind/chat

# apps/ops — Vite + React
cd apps/ops && pnpm create vite . --template react-ts
# → @modularmind/ops, vite.config.ts: base: '/ops'
# → Ajouter: react-router-dom, @modularmind/ui, @modularmind/api-client

# packages/ui, packages/api-client
# → Deja scaffolde
```

### 0.5 Initialiser le shared Python package

```bash
cd shared && pip install -e ".[dev]"
```

### 0.6 Setup Docker squelette

- `docker/docker-compose.dev.yml` avec db, redis, qdrant
- `docker/nginx/client.conf`
- Verifier `docker compose up db redis qdrant`

### 0.7 Setup CI

- `.gitignore`, `Makefile`, `.env.example`

**Critere**: `pnpm install && pnpm build` passe. Docker infra demarre. `pip install -e shared/` fonctionne.

---

## Phase 1 : Engine (le coeur)

**Objectif**: L'Engine tourne et execute des agents.

### 1.1 Copier le server

```bash
cp -r OLD_REPO/runtime/server/* NEW_REPO/engine/server/
cp -r OLD_REPO/runtime/mcp-sidecars/* NEW_REPO/engine/mcp-sidecars/
```

### 1.2 Fusionner le shared Python

```bash
cp OLD_REPO/shared/schemas/* NEW_REPO/shared/src/modularmind_shared/schemas/
cp OLD_REPO/shared/protocols/* NEW_REPO/shared/src/modularmind_shared/protocols/
```

Mettre a jour les imports :
```python
# Avant:
from shared.schemas import AgentConfig
# Apres:
from modularmind_shared.schemas import AgentConfig
```

### 1.3 Supprimer Celery, migrer vers Redis Streams

C'est le changement le plus important de la Phase 1.

**1.3a Supprimer Celery :**
- Supprimer `celery[redis]` du `pyproject.toml`
- Supprimer `engine/server/src/workers/celery_app.py`
- Supprimer les references a `celery_app` dans tout le code
- Ajouter `apscheduler>=3.10` au `pyproject.toml`

**1.3b Creer le worker Redis Streams :**

Creer `engine/server/src/worker/` :
```
worker/
├── __init__.py
├── runner.py      # Process principal (voir spec section 5.4)
├── tasks.py       # Handlers pour les task streams
└── scheduler.py   # APScheduler (voir spec section 5.4)
```

**1.3c Migrer chaque task Celery :**

| Ancienne task Celery | Nouveau stream Redis | Handler |
|---------------------|---------------------|---------|
| `execute_graph` | `tasks:executions` | `graph_execution_handler` |
| `pull_model` | `tasks:models` | `model_pull_handler` |
| `process_ended_conversation` | `memory:raw` | `extractor_handler` |
| Celery Beat `memory.consolidate` | APScheduler job | `memory_consolidation` |

**1.3d Adapter les publishers :**

Partout ou le code fait `celery_task.delay(...)`, remplacer par :
```python
# Avant:
from src.workers.tasks import execute_graph
execute_graph.delay(execution_id, graph_config)

# Apres:
from src.infra.redis_streams import get_event_bus
bus = await get_event_bus()
await bus.publish("tasks:executions", {
    "execution_id": execution_id,
    "graph_config": json.dumps(graph_config),
})
```

### 1.4 Migrer WebSocket → SSE

1. Creer `engine/server/src/infra/sse.py` (voir spec section 8)
2. Supprimer `engine/server/src/executions/websocket.py`
3. Modifier `executions/router.py` : WebSocket endpoint → `GET /{id}/stream` SSE
4. Adapter les tests

### 1.5 Consolider le module sync (pull model)

1. Creer `engine/server/src/sync/` avec le pull model :
   - `service.py` : poll le Platform, compare versions, applique configs
   - `router.py` : `POST /sync/trigger` (webhook du Platform)
2. Supprimer l'ancien module `manifest/`
3. Le scheduler appelle `sync_platform()` toutes les 5 min

```python
# engine/server/src/sync/service.py
import httpx

class SyncService:
    async def poll(self) -> bool:
        """Check platform for updates. Returns True if configs were updated."""
        if not self._client:
            return False
        resp = await self._client.get("/api/sync/manifest")
        resp.raise_for_status()
        manifest = resp.json()
        remote_version = manifest.get("version", 0)
        if remote_version <= self._local_version:
            return False
        # TODO: Fetch individual changed configs and apply
        self._local_version = remote_version
        return True
```

### 1.6 Ajouter les endpoints report

Creer `engine/server/src/report/` (voir spec section 4.4) :

```
report/
├── __init__.py
├── router.py    # GET /report/{status,metrics,models,pipeline}
└── service.py   # Collecte les metriques depuis infra (Redis, DB, Qdrant, models)
```

Le scheduler APScheduler appelle `report_to_platform()` toutes les 15 min
pour POST les metriques vers `{PLATFORM_URL}/api/reports`.

### 1.7 Adapter les Alembic migrations

```python
# alembic/env.py
context.configure(version_table="engine_alembic_version")
```

### 1.8 Copier les seed data

```bash
cp -r OLD_REPO/runtime/server/seed/* NEW_REPO/engine/server/seed/
```

### 1.9 Lancer les tests

```bash
cd engine/server && pytest tests/ -v
```

### 1.10 Smoke test

```bash
docker compose up db redis qdrant engine worker -d
curl http://localhost:8000/health
# → {"status": "ok", "redis": true, "database": true, "qdrant": true}
```

**Critere**: Engine demarre, health OK, tests passent, Celery supprime, Redis Streams fonctionne, SSE en place, sync pull OK.

---

## Phase 2 : Packages partages

**Objectif**: Extraire le code partage pour que Chat et Ops l'utilisent.

### 2.1 Package @modularmind/ui

```bash
cp OLD_REPO/runtime/dashboard/src/components/ui/* NEW_REPO/packages/ui/src/components/
cp OLD_REPO/runtime/dashboard/src/lib/utils.ts NEW_REPO/packages/ui/src/lib/utils.ts
```

### 2.2 Package @modularmind/api-client

1. Copier les types depuis l'ancien dashboard
2. Creer le client base sur `runtime-client.ts` (voir spec section 7.1)
3. Pas de `platform-client.ts` — il n'est plus utilise

### 2.3 Verifier

```bash
pnpm build --filter=@modularmind/ui
pnpm build --filter=@modularmind/api-client
pnpm typecheck
```

**Critere**: Les deux packages buildent sans erreur.

---

## Phase 3 : Ops Console (Vite + React)

**Objectif**: Le dashboard admin fonctionne.

### 3.1 Setup Vite + React Router

L'Ops Console est un SPA Vite (plus Next.js). Configurer :
- `vite.config.ts` avec `base: '/ops'`
- `react-router-dom` avec `<BrowserRouter basename="/ops">`
- Toutes les pages en tant que composants React Router

### 3.2 Copier et adapter le dashboard

```bash
cp OLD_REPO/runtime/dashboard/src/components/* NEW_REPO/apps/ops/src/components/
# (sauf chat/ et ui/)
```

- Convertir les pages Next.js `app/(dashboard)/*/page.tsx` en composants React standard
- Remplacer `useRouter()` (Next.js) par `useNavigate()` (React Router)
- Remplacer `<Link>` (Next.js) par `<Link>` (React Router)
- Supprimer les `"use client"` directives

### 3.3 Retirer le chat

- Supprimer tout ce qui est lie au chat (pages, composants, hooks)
- Garder le Playground (essentiel pour tester apres un push)

### 3.4 Ajouter le monitoring pipeline

Page monitoring → onglet "Pipeline" :
- Etat des streams Redis (pending, lag)
- Messages en DLQ
- Health des consumers
- Via `GET /api/v1/internal/monitoring/pipeline`

### 3.5 Migrer vers les packages partages

```
@/components/ui/*          → @modularmind/ui
@/lib/api/runtime-client   → @modularmind/api-client
```

### 3.6 Verifier

```bash
pnpm dev --filter=@modularmind/ops
# → http://localhost:5174/ops/
# Navigation: monitoring, agents, models, configuration, knowledge, users, playground
```

**Critere**: Ops Console demarre, toutes les pages fonctionnent, Playground OK, pipeline monitoring OK.

---

## Phase 4 : Chat App (Vite + React)

**Objectif**: App de chat legere, connectee a l'Engine.

### 4.1 Creer les pages

**Login** (`src/pages/Login.tsx`) :
- Formulaire email + password → `api.auth.login()`
- Redirect vers `/` apres login

**Chat** (`src/pages/Chat.tsx`) :
- Liste conversations (sidebar)
- Zone de chat (centre)
- Selection d'agent
- Streaming SSE

### 4.2 Porter la logique de chat

Reprendre depuis l'ancien dashboard :
- `components/chat/ChatInput.tsx` → adapter (retirer deps Next.js)
- `components/chat/ExecutionActivity.tsx`
- `hooks/useChat.ts`, `hooks/useExecution.ts`

### 4.3 Streaming SSE

```typescript
// apps/chat/src/hooks/useStreaming.ts
export function useStreaming(executionId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done'>('idle');

  useEffect(() => {
    if (!executionId) return;
    setStatus('streaming');
    const es = new EventSource(`/api/v1/executions/${executionId}/stream`);

    es.addEventListener('tokens', (e) => {
      setEvents(prev => [...prev, JSON.parse(e.data)]);
    });
    es.addEventListener('complete', (e) => {
      setEvents(prev => [...prev, JSON.parse(e.data)]);
      setStatus('done');
      es.close();
    });

    return () => es.close();
  }, [executionId]);

  return { events, status };
}
```

### 4.4 Verifier

```bash
# Build et test derriere nginx
pnpm build --filter=@modularmind/chat
# Copier dist/ dans nginx
# http://localhost/ → login → chat → message → streaming SSE
```

**Critere**: Chat fonctionne, login OK, streaming SSE OK, cookies HttpOnly OK.

---

## Phase 5 : Memory Pipeline

**Objectif**: Pipeline event-driven a 2 etapes.

### 5.1 Implementer les handlers

**Extractor** (extract + score en une seule etape) :
- Reprendre `memory/fact_extractor.py`
- Le prompt LLM extrait les faits ET score leur importance (0-1)
- Score < 0.3 → XACK sans emit (drop silencieux)
- Publier dans `memory:extracted`

**Embedder** :
- Reprendre `memory/vector_store.py`
- Generate embeddings → Qdrant + PostgreSQL

### 5.2 Integrer au flow d'execution

Dans `worker/tasks.py` :
```python
if settings.FACT_EXTRACTION_ENABLED:
    await bus.publish("memory:raw", {
        "conversation_id": str(conversation_id),
        "agent_id": agent_id,
        "messages": json.dumps(serialize_messages(messages)),
    })
```

### 5.3 Consolidation periodique

APScheduler job (toutes les 6h) :
- Fusionner faits redondants
- Appliquer decay temporel
- Prune score < 0.1

### 5.4 Tests

- Test unitaire de chaque handler (mock LLM, mock Qdrant)
- Test DLQ : handler crash 3 fois → message dans `memory:dlq`
- Test async : chat repond AVANT que le pipeline finisse

**Critere**: Pipeline tourne, memoires traitees en background, DLQ fonctionne.

---

## Phase 6 : Platform (Next.js full-stack)

**Objectif**: Le Platform fonctionne et les Engines peuvent sync.

### 6.1 Setup Next.js + Prisma

```bash
cd platform
npx create-next-app@latest . --typescript --tailwind --app --src-dir
npm install prisma @prisma/client next-auth
npx prisma init
```

### 6.2 Schema Prisma

```prisma
model Client {
  id        String   @id @default(cuid())
  name      String
  engines   Engine[]
  createdAt DateTime @default(now())
}

model Engine {
  id        String   @id @default(cuid())
  name      String
  url       String
  apiKey    String   @unique
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id])
  lastSeen  DateTime?
  version   Int      @default(0)
  createdAt DateTime @default(now())
}

model Agent {
  id          String   @id @default(cuid())
  name        String
  description String
  model       String
  provider    String
  config      Json
  channel     String   @default("dev")  // dev | beta | stable
  version     Int      @default(1)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Graph {
  id          String   @id @default(cuid())
  name        String
  description String
  nodes       Json
  edges       Json
  channel     String   @default("dev")
  version     Int      @default(1)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 6.3 API Routes sync

```typescript
// platform/src/app/api/sync/manifest/route.ts
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('X-Engine-Key');
  const engine = await db.engine.findUnique({ where: { apiKey } });
  if (!engine) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agents = await db.agent.findMany({ where: { channel: 'stable' } });
  const graphs = await db.graph.findMany({ where: { channel: 'stable' } });

  return NextResponse.json({
    version: computeVersion(agents, graphs),
    agent_count: agents.length,
    graph_count: graphs.length,
  });
}
```

### 6.4 Pages Studio

Migrer depuis l'ancien `frontend/` :
- Agent editor
- Graph editor (React Flow)
- Templates library
- Releases (dev/beta/stable channels)

### 6.5 Pages Admin

Nouvelles pages :
- `/admin/clients` — gestion clients
- `/admin/engines` — Engines enregistres, health, sync status
- `/admin/settings`

### 6.6 Pages Vitrine

Nouvelles pages :
- `/` — landing page
- `/features` — liste des features
- `/pricing` — plans tarifaires
- `/docs` — documentation

### 6.7 Verifier

- Platform demarre
- Engine s'enregistre au demarrage → visible dans `/admin/engines`
- Engine poll `/api/sync/manifest` → recoit configs
- Engine envoie reports → visible dans `/admin/engines`

**Critere**: Platform fonctionnel, sync pull OK, admin OK.

---

## Phase 7 : Docker & Deploiement

**Objectif**: Tout fonctionne en Docker.

### 7.1 Dockerfiles

| Service | Dockerfile | Strategy |
|---------|-----------|----------|
| `engine` | `engine/server/Dockerfile` | Python multi-stage, copie shared/ |
| `worker` | Meme image que engine | `command: python -m src.worker.runner` |
| `chat` | Build Vite → fichiers statiques | Monte dans nginx |
| `ops` | Build Vite → fichiers statiques | Monte dans nginx `/ops/` |
| `platform` | `platform/Dockerfile` | Next.js standalone |

### 7.2 Nginx

Un seul nginx sert tout cote client :
- Chat static files a `/`
- Ops static files a `/ops/`
- Proxy vers Engine a `/api/`
- Pas de container dedie pour Chat/Ops

### 7.3 Build des apps statiques

```bash
# Build Chat et Ops
pnpm build --filter=@modularmind/chat
pnpm build --filter=@modularmind/ops

# Copier dans un dossier pour nginx
cp -r apps/chat/dist/ docker/static/chat/
cp -r apps/ops/dist/ docker/static/ops/
```

Alternative : multi-stage Dockerfile nginx qui build et copie.

### 7.4 Test E2E

1. `docker compose up -d` → tout demarre
2. `curl http://localhost/health` → OK
3. `http://localhost/ops/setup` → creer premier user
4. `http://localhost/` → login → chat → message → streaming
5. `http://localhost/ops/monitoring` → metriques + pipeline
6. Depuis le Platform, publier un agent → Engine sync en < 5 min

**Critere**: Deploiement one-command OK. 7 containers max. E2E passe.

---

## Phase 8 : Nettoyage & Documentation

### 8.1 CLAUDE.md

Reecrire pour V2 (nouvelle structure, nouveaux patterns).

### 8.2 Supprimer le code mort

- Aucun Celery ref
- Aucun WebSocket ref
- Aucun platform-client ref
- Aucun sync-service ref
- `ruff check` + `pnpm lint`

### 8.3 README

- README principal
- Guide deploiement client
- Guide deploiement Platform

### 8.4 Stabilisation

1. Deployer V2 en production
2. Garder V1 deployable pendant 2 semaines
3. Valider zero regression
4. Archiver V1

---

## Ordre d'execution

```
Phase 0 (Setup)           ██░░░░░░░░  Fondations
Phase 1 (Engine)          ████████░░  Le plus critique (Celery→Redis Streams, SSE)
Phase 2 (Packages)        ██░░░░░░░░  Prerequis pour Phase 3+4
Phase 3 (Ops)             ███░░░░░░░  Vite + React (plus de Next.js)
Phase 4 (Chat)            ███░░░░░░░  Vite + React, scope limite
Phase 5 (Pipeline)        ███░░░░░░░  2 etapes, integre au worker
Phase 6 (Platform)        ████░░░░░░  Next.js full-stack (vitrine + studio + admin)
Phase 7 (Docker)          ███░░░░░░░  Integration finale, nginx static
Phase 8 (Cleanup)         ██░░░░░░░░  Stabilisation 2 semaines
```

**Parallelisable** :
- Phase 3 (Ops) et Phase 4 (Chat) en parallele apres Phase 2
- Phase 5 (Pipeline) en parallele avec Phase 3/4
- Phase 6 (Platform) des que Phase 1 est terminee

```
Timeline:
Phase 0 ──► Phase 1 ──► Phase 2 ──┬──► Phase 3 (Ops)     ──┐
             (Engine)              ├──► Phase 4 (Chat)     ──┤
                                   └──► Phase 5 (Pipeline)  ─┤──► Phase 7 ──► Phase 8
                        Phase 1 ──────► Phase 6 (Platform) ──┘     (E2E)    (stabilisation)
```
