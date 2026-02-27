# ModularMind V2 - Plan de Migration

> Plan d'execution phase par phase.
> Reference: [spec.md](spec.md)
> Revise apres review critique.

---

## Strategie de rollback

L'ancien repo (`ModularMind-IA`) reste **operationnel et deployable** pendant
toute la migration. Il n'est archive qu'apres 2 semaines de stabilite en
production sur le V2.

- Tag `v1-final` sur l'ancien repo avant de commencer
- L'ancien repo garde ses Docker images fonctionnelles
- En cas de probleme critique sur V2 : redeployer V1 en une commande
- L'archive (Phase 8.4) n'a lieu qu'apres validation complete

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

```bash
mkdir ModularMind-V2 && cd ModularMind-V2
git init

mkdir -p studio/backend studio/frontend
mkdir -p engine/server engine/mcp-sidecars
mkdir -p apps/chat apps/ops
mkdir -p packages/api-client/src packages/ui/src
mkdir -p shared/src/modularmind_shared/protocols
mkdir -p shared/src/modularmind_shared/schemas
mkdir -p docker/nginx
mkdir -p docs
```

### 0.3 Initialiser le monorepo TypeScript

```bash
pnpm init
pnpm add -Dw turbo

# Creer turbo.json (voir spec.md section 10)
# Creer pnpm-workspace.yaml (voir spec.md section 10)
# Creer package.json root avec scripts (voir spec.md section 10)
```

### 0.4 Initialiser chaque package

```bash
# packages/ui
cd packages/ui && pnpm init
# → name: "@modularmind/ui"
# → Ajouter: tailwindcss, @radix-ui/*, lucide-react, class-variance-authority

# packages/api-client
cd packages/api-client && pnpm init
# → name: "@modularmind/api-client"
# → TypeScript only, zero deps runtime

# apps/chat
cd apps/chat
pnpm create vite . --template react-ts
# → name: "@modularmind/chat"
# → Ajouter deps: @modularmind/ui, @modularmind/api-client
# → Ajouter deps: tailwindcss, zustand, react-router-dom, framer-motion

# apps/ops
cd apps/ops
npx create-next-app@latest . --typescript --tailwind --app --src-dir
# → name: "@modularmind/ops"
# → next.config.ts: basePath: '/ops'
# → Ajouter deps: @modularmind/ui, @modularmind/api-client
# → Ajouter deps: zustand, recharts, @xyflow/react, framer-motion
```

### 0.5 Initialiser le shared Python package

```bash
cd shared

# Creer pyproject.toml (voir spec.md section 7)
# Creer src/modularmind_shared/__init__.py
# Creer src/modularmind_shared/protocols/__init__.py
# Creer src/modularmind_shared/schemas/__init__.py
```

### 0.6 Setup Docker squelette

- Creer `docker/docker-compose.yml` avec les services infrastructure (db, redis, qdrant)
- Creer `docker/nginx/client.conf` (voir spec.md section 8)
- Verifier que `docker compose up db redis qdrant` demarre correctement

### 0.7 Setup basique CI

- `.gitignore` (node_modules, dist, .next, __pycache__, .env, *.pyc, etc.)
- `Makefile` avec commandes de base
- `.env.example` avec toutes les variables necessaires

**Critere de completion**: `pnpm install && pnpm build` passe (meme si les apps sont vides). Docker infrastructure demarre. `pip install -e shared/` fonctionne.

---

## Phase 1 : Engine (le coeur)

**Objectif**: L'Engine tourne et execute des agents exactement comme le runtime/server actuel.

### 1.1 Copier le server

```bash
cp -r OLD_REPO/runtime/server/* NEW_REPO/engine/server/
cp -r OLD_REPO/runtime/mcp-sidecars/* NEW_REPO/engine/mcp-sidecars/
```

### 1.2 Fusionner et restructurer le shared Python

Fusionner les deux locations existantes dans le nouveau package installable :

```bash
# Copier les schemas depuis les deux sources
cp OLD_REPO/shared/schemas/* NEW_REPO/shared/src/modularmind_shared/schemas/
cp OLD_REPO/shared/protocols/* NEW_REPO/shared/src/modularmind_shared/protocols/

# Si runtime/shared/ a des fichiers supplementaires, les merger
cp OLD_REPO/runtime/shared/schemas/* NEW_REPO/shared/src/modularmind_shared/schemas/
cp OLD_REPO/runtime/shared/protocols/* NEW_REPO/shared/src/modularmind_shared/protocols/
```

Mettre a jour tous les imports dans le code Engine :

```python
# Avant:
from shared.schemas import AgentConfig
from shared.schemas.sync import SyncManifest

# Apres:
from modularmind_shared.schemas import AgentConfig
from modularmind_shared.schemas.sync import SyncManifest
```

Installer le shared package dans l'Engine :

```bash
cd engine/server
pip install -e ../../shared/
```

### 1.3 Adapter les Alembic migrations

Les migrations de l'ancien runtime/server doivent fonctionner sur une DB vierge :

```bash
cd engine/server

# Tester sur une DB vierge
docker compose up db -d
alembic upgrade head
# → doit passer sans erreur

# Si des revisions ont des conflits, les rebaser
alembic history --verbose
```

Prefixer les revisions avec `engine_` pour eviter tout conflit futur avec le Studio :

```python
# alembic/env.py
def run_migrations_online():
    # ... existing config
    context.configure(
        # ...
        version_table="engine_alembic_version",  # table separee
    )
```

Verifier que les tables LangGraph (checkpoints) sont aussi creees.

### 1.4 Adapter les imports et le Dockerfile

- Verifier que tous les imports internes fonctionnent (`src.*` paths)
- Adapter le Dockerfile : le context est maintenant la racine du monorepo

```dockerfile
# engine/server/Dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app

# Install shared package first
COPY shared/ /tmp/shared/
RUN pip install --no-cache-dir /tmp/shared/

# Install engine deps from pyproject.toml (NOT requirements.txt)
COPY engine/server/pyproject.toml engine/server/
RUN pip install --no-cache-dir -e engine/server/

# Copy engine code
COPY engine/server/ engine/server/

WORKDIR /app/engine/server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 1.5 Copier les seed data

```bash
# Copier les templates agents/graphs
cp -r OLD_REPO/runtime/server/seed/* NEW_REPO/engine/server/seed/
# ou si les seeds sont dans un autre path, adapter en consequence
```

Verifier que le seeding fonctionne au demarrage (68 agents, 3 graphs).

### 1.6 Verifier le fonctionnement

```bash
docker compose up db redis qdrant engine -d

# Health check
curl http://localhost:8000/health
# → {"status": "ok", "redis": true, "database": true, "qdrant": true}
```

### 1.7 Lancer les tests existants

```bash
cd engine/server
pytest tests/ -v
# Tous les tests du runtime/server doivent passer
```

### 1.8 Consolider le module sync

Absorber `manifest/router.py` dans le nouveau module `sync/` :

1. Creer `engine/server/src/sync/`
2. Deplacer la logique de manifest dans `sync/manifest_router.py`
3. Creer `sync/router.py` avec les endpoints push (voir spec section 4.3)
4. Supprimer l'ancien module `manifest/`
5. Mettre a jour le montage des routes dans `main.py`

```python
# engine/server/src/sync/router.py
@router.post("/api/v1/sync/push")
async def receive_sync_push(
    payload: SyncPayload,
    x_sync_signature: str = Header(...),
    x_sync_timestamp: str = Header(...),
    x_sync_spec_version: int = Header(default=1),
):
    # Verifier la version du format
    if x_sync_spec_version > SUPPORTED_SPEC_VERSION:
        raise HTTPException(
            422,
            f"Unsupported spec version {x_sync_spec_version}. Max supported: {SUPPORTED_SPEC_VERSION}"
        )
    verify_hmac(payload, x_sync_signature, x_sync_timestamp)
    await sync_service.apply(payload)
```

### 1.8b Migrer WebSocket → SSE

Remplacer l'ancien streaming WebSocket par SSE (Server-Sent Events) :

1. Creer `engine/server/src/infra/sse.py` (voir spec section 7.1)
2. Supprimer `engine/server/src/executions/websocket.py`
3. Modifier `engine/server/src/executions/router.py` :
   - Remplacer le WebSocket endpoint par un `GET /{execution_id}/stream`
   - Utiliser `sse_response()` de `infra/sse.py`
   - Ajouter support `Last-Event-ID` header pour le replay
4. Supprimer les imports et config lies au WebSocket dans `main.py`
5. Adapter les tests existants (si `test_websocket.py` existe → `test_sse.py`)

```python
# engine/server/src/executions/router.py — nouveau endpoint SSE
from src.infra.sse import sse_response

@router.get("/{execution_id}/stream")
async def stream_execution(
    request: Request,
    execution_id: str,
    user: User = Depends(get_current_user),
    last_event_id: str | None = Header(None, alias="Last-Event-ID"),
):
    async def event_generator():
        if last_event_id:
            missed = await replay_from_buffer(execution_id, after=last_event_id)
            for event in missed:
                yield event
        async for event in redis_pubsub.listen(f"execution:{execution_id}"):
            yield event
            if event.get("type") in ("complete", "error"):
                break

    return await sse_response(event_generator(), request)
```

### 1.9 Ajouter les endpoints report

Creer `engine/server/src/report/` (voir spec section 4.4).

### 1.10 Smoke test complet

Avant de passer a la phase suivante, valider le flow critique de bout en bout :

```bash
# 1. Engine tourne
curl http://localhost:8000/health

# 2. Setup (creer premier user)
curl -X POST http://localhost:8000/api/v1/setup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "test123"}'

# 3. Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "test123"}' \
  -c cookies.txt

# 4. Lister les agents
curl http://localhost:8000/api/v1/agents -b cookies.txt

# 5. Creer une conversation et envoyer un message
curl -X POST http://localhost:8000/api/v1/conversations \
  -b cookies.txt -H "Content-Type: application/json" \
  -d '{"title": "Test"}'

# 6. Verifier les endpoints sync/report
curl -X GET http://localhost:8000/api/v1/report/status \
  -H "X-Sync-Signature: ..." -H "X-Sync-Timestamp: ..."
```

**Critere de completion**: Engine demarre, health OK, tests passent, smoke test OK, module sync consolide, endpoints report repondent, WebSocket supprime et SSE en place.

---

## Phase 2 : Packages partages

**Objectif**: Extraire le code partage pour que Chat et Ops puissent l'utiliser.

### 2.1 Package @modularmind/ui

Extraire les composants shadcn/ui depuis l'ancien dashboard :

```bash
cp OLD_REPO/runtime/dashboard/src/components/ui/* NEW_REPO/packages/ui/src/components/
cp OLD_REPO/runtime/dashboard/src/lib/utils.ts NEW_REPO/packages/ui/src/lib/utils.ts
```

Creer `packages/ui/src/index.ts` :

```typescript
export { Button } from './components/button';
export { Card, CardContent, CardHeader, CardTitle } from './components/card';
export { Dialog, DialogContent, DialogHeader, DialogTitle } from './components/dialog';
// ... tous les composants
export { cn } from './lib/utils';
```

Configurer le `package.json` avec les peer deps Tailwind et React.

### 2.2 Package @modularmind/api-client

1. Copier les types: `OLD_REPO/runtime/dashboard/src/lib/types/*` → `packages/api-client/src/types/`
2. Creer le client generique base sur `runtime-client.ts` (voir spec section 6.1)
   - **HttpOnly cookies** avec `credentials: 'include'`
   - **Refresh mutex** pour eviter les races sur 401
   - `basePath: '/api/v1'` (meme origine via nginx)
3. Extraire chaque module API (auth, conversations, executions, etc.)
4. Ne PAS copier `platform-client.ts` — il n'est plus utilise

### 2.3 Verifier

```bash
pnpm build --filter=@modularmind/ui
pnpm build --filter=@modularmind/api-client
# Les deux buildent sans erreur
pnpm typecheck
# Zero erreur de type
```

**Critere de completion**: Les deux packages buildent. Les types sont corrects. Le client API couvre auth + conversations + executions + monitoring.

---

## Phase 3 : Ops Console

**Objectif**: Le dashboard admin fonctionne, connecte a l'Engine via nginx.

### 3.1 Copier le dashboard actuel

```bash
cp -r OLD_REPO/runtime/dashboard/* NEW_REPO/apps/ops/
```

### 3.2 Configurer basePath

```typescript
// apps/ops/next.config.ts
const nextConfig = {
  basePath: '/ops',
  // Retirer les rewrites — nginx gere le proxy maintenant
};
```

### 3.3 Retirer le chat

- Supprimer `apps/ops/src/app/(dashboard)/chat/`
- Supprimer `apps/ops/src/components/chat/`
- Retirer les liens vers `/chat` dans le Sidebar
- Retirer les hooks/stores lies au chat (useChat, etc.)

### 3.4 Garder le Playground

Le Playground (`components/playground/`) reste dans l'Ops Console.
Il est essentiel pour tester les agents et graphs apres un push depuis le Studio.

S'assurer que les 4 hooks (usePlayground, usePlaygroundAgent, usePlaygroundGraph, usePlaygroundModel) fonctionnent.

Ajouter la route `/ops/playground` si elle n'existe pas deja.

### 3.5 Ajouter le monitoring pipeline

Ajouter dans la page monitoring un onglet "Pipeline" qui affiche :
- Etat des streams Redis (pending, lag)
- Messages en DLQ
- Health des consumers
- Via `GET /api/v1/internal/monitoring/pipeline`

### 3.6 Migrer vers les packages partages

```
Remplacer:                          Par:
@/components/ui/*                   @modularmind/ui
@/lib/api/runtime-client.ts         @modularmind/api-client
@/lib/api/*.ts                      @modularmind/api-client
@/lib/types/*                       @modularmind/api-client/types
```

Retirer `platform-client.ts` — il n'est plus utilise (confirme par le codebase actuel).

### 3.7 Adapter l'API client

```typescript
// apps/ops/src/lib/api.ts
import { createApiClient } from '@modularmind/api-client';

export const api = createApiClient({
  basePath: '/api/v1',  // meme origine grace a nginx
  onUnauthorized: () => {
    // Event-based — AuthProvider calls router.push('/login')
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  },
});
```

### 3.7b Remplacer tous les window.location.href

**Etape critique.** Chercher et remplacer systematiquement dans tout le code
copie du dashboard :

```bash
# Trouver toutes les occurrences
grep -rn "window.location.href" apps/ops/src/
grep -rn "window.location.replace" apps/ops/src/
```

Remplacer chaque occurrence par `router.push()` (Next.js `useRouter`) ou
`redirect()` (Server Components). Ceci est **obligatoire** car `basePath: '/ops'`
n'est applique que par le router Next.js — `window.location.href = '/login'`
irait a `/login` au lieu de `/ops/login`.

Fichiers principaux a verifier :
- `contexts/AuthContext.tsx` — redirects `/login`, `/setup`
- `components/dashboard/Sidebar.tsx` — liens de navigation
- Tout composant utilisant `window.location` pour naviguer

### 3.8 Dockerfile avec turbo prune

```dockerfile
# apps/ops/Dockerfile
FROM node:22-alpine AS pruner
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @modularmind/ops --docker

FROM node:22-alpine AS installer
RUN corepack enable
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@modularmind/ops

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/ops/.next/standalone ./
COPY --from=builder /app/apps/ops/.next/static .next/static
COPY --from=builder /app/apps/ops/public public/
ENV PORT=3000
CMD ["node", "server.js"]
```

### 3.9 Verifier

```bash
pnpm dev --filter=@modularmind/ops
# Dashboard s'ouvre sur http://localhost:3001/ops
# Navigation: monitoring (+ pipeline), agents, models, configuration,
#             knowledge, users, fine-tuning, playground
# Pas de /chat
```

**Critere de completion**: Ops Console demarre, toutes les pages fonctionnent, Playground OK, pipeline monitoring OK, connecte a l'Engine.

---

## Phase 4 : Chat App

**Objectif**: App de chat legere, fonctionnelle, connectee a l'Engine via nginx.

### 4.1 Setup Vite + React

Deja fait en Phase 0. Ajouter les deps manquantes :
- `react-router-dom` (navigation login → chat)
- `framer-motion` (animations du chat, porte depuis l'ancien dashboard)
- `@modularmind/ui` et `@modularmind/api-client`

### 4.2 Creer les pages

**Login page** (`src/pages/Login.tsx`):
- Formulaire email + password
- Appelle `api.auth.login()` — set le cookie HttpOnly
- Redirige vers `/` (chat) apres login

**Chat page** (`src/pages/Chat.tsx`):
- Liste des conversations (sidebar gauche)
- Zone de chat (centre)
- Selection d'agent via "+" (panel droit ou modal)
- Streaming des reponses via SSE (Server-Sent Events)

### 4.3 Porter la logique de chat

Reprendre depuis l'ancien dashboard :
- `components/chat/ChatInput.tsx` → adapter (retirer les deps Next.js)
- `components/chat/ExecutionActivity.tsx` → adapter
- `components/chat/AgentMention.tsx` → adapter
- `hooks/useChat.ts` → adapter pour Vite
- `hooks/useExecution.ts` → adapter

### 4.4 Streaming SSE

SSE (Server-Sent Events) remplace WebSocket. Le streaming V2 est 100%
unidirectionnel (server → client) — SSE est plus simple, supporte l'auth
cookie native, et offre la reconnexion automatique via `Last-Event-ID`.

```typescript
// apps/chat/src/hooks/useStreaming.ts
export function useStreaming(executionId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done'>('idle');

  useEffect(() => {
    if (!executionId) return;
    setStatus('streaming');

    // SSE — plain HTTP GET, cookies sent automatically, reconnection built-in.
    // No protocol switch (ws:/wss:), no nginx upgrade config needed.
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
      if (es.readyState === EventSource.CLOSED) {
        setStatus('done');
      }
    });

    return () => es.close();
  }, [executionId]);

  return { events, status };
}
```

Note : SSE utilise le meme prefix `/api/v1/` que le REST, meme domaine.
Les cookies HttpOnly sont envoyes automatiquement (requete HTTP standard).
Pas besoin de `map $http_upgrade` nginx, pas de `proxy_read_timeout 86400s`.
Le `Last-Event-ID` header gere le replay en cas de reconnexion.

### 4.4b Pattern chemins relatifs (Chat)

Le Chat est un SPA Vite qui tourne derriere nginx a la racine `/`.
Tous les appels API utilisent des chemins relatifs via `@modularmind/api-client`
avec `basePath: '/api/v1'`. Il n'y a **pas** besoin d'un endpoint `/api/config`
car la configuration (URL de l'Engine) est implicite — tout passe par nginx
sur la meme origine.

```
Chat app                    Nginx                    Engine
 fetch('/api/v1/agents')  ──►  location /api/ { }  ──►  :8000/api/v1/agents
 EventSource('/api/..')   ──►  location /api/ { }  ──►  :8000/api/v1/...  (SSE stream)
```

Pas de `NEXT_PUBLIC_API_URL`, pas de `.env` cote client, pas de configuration
runtime. Le SPA n'a besoin de connaitre aucune URL absolue.

### 4.5 Dockerfile avec turbo prune

```dockerfile
# apps/chat/Dockerfile
FROM node:22-alpine AS pruner
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @modularmind/chat --docker

FROM node:22-alpine AS installer
RUN corepack enable
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@modularmind/chat

FROM nginx:alpine
COPY --from=builder /app/apps/chat/dist /usr/share/nginx/html
# SPA fallback
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; try_files $uri /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 4.6 Verifier

```bash
# Via nginx (integration complete)
docker compose --profile chat up -d

# http://localhost/ → Chat login
# Login → chat → envoyer message → reponse streamee
# Les cookies fonctionnent car meme domaine (via nginx)
```

**Critere de completion**: Chat app fonctionne derriere nginx, login OK, streaming SSE OK, cookies HttpOnly OK.

---

## Phase 5 : Memory Pipeline

**Objectif**: Pipeline event-driven qui traite les memoires en background.

### 5.1 Creer le module pipeline

```
engine/server/src/pipeline/
├── __init__.py
├── bus.py              # EventBus ABC
├── redis_streams.py    # Redis Streams (backoff, DLQ, retry count)
├── consumer.py         # Consumer runner (graceful shutdown, signal handling)
├── health.py           # HTTP health endpoint (port 8001)
└── handlers/
    ├── __init__.py
    ├── extractor.py    # Extraction de faits via LLM
    ├── scorer.py       # Scoring importance/novelty/relevance
    └── embedder.py     # Generation embeddings + upsert Qdrant + insert PG
```

### 5.2 Implementer l'EventBus + Redis Streams

Voir spec.md sections 5.3 et 5.4 pour le code complet.

Points cles implementes :
- **Exponential backoff** sur perte de connexion Redis (1s → 30s max)
- **Dead Letter Queue** (`memory:dlq`) apres 3 retries
- **Graceful shutdown** via signal handlers (SIGTERM, SIGINT)
- **Health endpoint** HTTP sur port 8001 pour Docker healthcheck
- **`return_exceptions=True`** dans `asyncio.gather` pour isoler les crashes
- **`stream_info()`** pour le monitoring depuis l'Ops Console

### 5.3 Implementer les handlers

**Extractor** :
- Reprendre la logique de `memory/fact_extractor.py` existant
- Input: messages bruts d'une conversation
- Process: prompt LLM pour extraire faits, entites, relations
- Config: respecter `FACT_EXTRACTION_ENABLED` (opt-in)

**Scorer** :
- Input: faits extraits
- Process: LLM leger + heuristiques (importance, novelty, relevance)
- Filter: score < 0.3 → XACK sans emitter (drop silencieux)

**Embedder** :
- Reprendre la logique de `memory/vector_store.py` existant
- Input: faits scores
- Process: embeddings → Qdrant + PostgreSQL (metadata)
- Necessite: DATABASE_URL, QDRANT_URL, embedding model

### 5.4 Integrer au flow d'execution

Dans `workers/tasks.py`, modifier `process_ended_conversation()` :

```python
# Remplacer l'appel direct a fact_extractor.extract_from_conversation()
# par un publish dans le pipeline

if settings.FACT_EXTRACTION_ENABLED:
    from src.pipeline.bus import get_event_bus
    bus = await get_event_bus()
    await bus.publish("memory:raw", {
        "conversation_id": str(conversation_id),
        "agent_id": agent_id,
        "user_id": str(user_id),
        "messages": json.dumps(serialize_messages(messages)),
        "timestamp": datetime.now(UTC).isoformat(),
    })
```

Supprimer l'ancien appel synchrone a `FactExtractor` dans ce task.

### 5.5 Consolidation periodique

Ajouter dans Celery Beat :

```python
# workers/celery_app.py
beat_schedule = {
    "memory-consolidation": {
        "task": "memory.consolidate",
        "schedule": crontab(minute=0, hour="*/6"),
    },
}
```

### 5.6 Tests

- Test unitaire de chaque handler (mock LLM, mock Qdrant, mock DB)
- Test d'integration : publish dans `memory:raw` → verifier que Qdrant recoit l'embedding
- Test DLQ : handler qui crash 3 fois → message dans `memory:dlq`
- Test async : verifier que le chat a repondu AVANT que le pipeline finisse

**Critere de completion**: Pipeline tourne, memoires traitees en background, DLQ fonctionne, consolidation toutes les 6h, monitoring accessible dans l'Ops.

---

## Phase 6 : Studio

**Objectif**: Le Studio fonctionne et push vers l'Engine.

### 6.1 Copier le platform backend

```bash
cp -r OLD_REPO/backend/* NEW_REPO/studio/backend/
```

### 6.2 Adapter le shared Python

Meme traitement qu'en Phase 1.2 : mettre a jour les imports vers `modularmind_shared`.

Installer dans le Studio :

```bash
cd studio/backend
pip install -e ../../shared/
```

### 6.3 Adapter les Alembic migrations

```python
# studio/backend/alembic/env.py
context.configure(
    version_table="studio_alembic_version",  # table separee
)
```

Tester sur une DB vierge : `alembic upgrade head`.

### 6.4 Adapter le sync (push au lieu de poll)

D'abord, definir le modele `PendingSyncPush` pour la queue offline :

```python
# studio/backend/src/sync/models.py

from datetime import datetime, UTC
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean
from src.core.database import Base

class PendingSyncPush(Base):
    """Stores failed sync pushes for retry when an Engine is offline."""
    __tablename__ = "pending_sync_pushes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    engine_url = Column(String(512), nullable=False, index=True)
    payload = Column(Text, nullable=False)  # JSON serialized SyncPayload
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    retry_count = Column(Integer, nullable=False, default=0)
    last_retry_at = Column(DateTime(timezone=True), nullable=True)
    resolved = Column(Boolean, nullable=False, default=False)
    error = Column(Text, nullable=True)
```

Ajouter une migration Alembic pour cette table :

```bash
cd studio/backend
alembic revision --autogenerate -m "add pending_sync_pushes table"
alembic upgrade head
```

Ensuite, implementer le service de push :

```python
# studio/backend/src/sync/service.py

class SyncPushService:
    """Push configs vers un Engine client."""

    async def push_to_engine(self, engine_url: str, payload: SyncPayload):
        signature = hmac_sign(payload, self.hmac_secret)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{engine_url}/api/v1/sync/push",
                    json=payload.model_dump(),
                    headers={
                        "X-Sync-Signature": f"sha256={signature}",
                        "X-Sync-Timestamp": str(int(time.time())),
                        "X-Sync-Spec-Version": str(SPEC_VERSION),
                    },
                )
                response.raise_for_status()
                return SyncResult(success=True)
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            # Engine offline — queue for retry
            await self._enqueue_retry(engine_url, payload)
            return SyncResult(success=False, error=str(e), queued=True)

    async def _enqueue_retry(self, engine_url: str, payload: SyncPayload):
        """Store failed push in DB for retry. UI shows pending syncs."""
        await self.db.execute(
            insert(PendingSyncPush).values(
                engine_url=engine_url,
                payload=payload.model_dump_json(),
                created_at=datetime.now(UTC),
            )
        )
```

### 6.5 Ajouter le pull de reports

```python
# studio/backend/src/sync/service.py

async def pull_engine_report(self, engine_url: str) -> EngineReport:
    signature = hmac_sign_get(self.hmac_secret)
    async with httpx.AsyncClient(timeout=15.0) as client:
        status = await client.get(
            f"{engine_url}/api/v1/report/status",
            headers=self._hmac_headers(signature),
        )
        metrics = await client.get(
            f"{engine_url}/api/v1/report/metrics",
            headers=self._hmac_headers(signature),
        )
        pipeline = await client.get(
            f"{engine_url}/api/v1/report/pipeline",
            headers=self._hmac_headers(signature),
        )
        return EngineReport(
            status=status.json(),
            metrics=metrics.json(),
            pipeline=pipeline.json(),
        )
```

### 6.6 Copier le platform frontend

```bash
cp -r OLD_REPO/frontend/* NEW_REPO/studio/frontend/
```

Adapter pour utiliser `@modularmind/ui` si possible (optionnel, peut garder ses propres composants).

### 6.7 Verifier

- Studio backend demarre
- Studio frontend demarre
- Push d'un agent vers l'Engine → l'Engine le recoit et l'applique
- Push echoue (Engine offline) → stock en queue, visible dans l'UI
- Pull de metrics depuis l'Engine → le Studio affiche les donnees

**Critere de completion**: Studio fonctionnel, push/pull OK, gestion offline OK.

---

## Phase 7 : Docker & Deploiement

**Objectif**: Tout fonctionne en Docker, pret pour un deploiement client.

### 7.1 Dockerfiles

Tous les Dockerfiles utilisent **multi-stage builds** et le contexte depuis la racine :

| Service | Dockerfile | Build strategy |
|---------|-----------|---------------|
| `engine` | `engine/server/Dockerfile` | Python multi-stage, copie shared/ |
| `chat` | `apps/chat/Dockerfile` | `turbo prune` → Vite build → nginx |
| `ops` | `apps/ops/Dockerfile` | `turbo prune` → Next.js standalone |
| `studio-backend` | `studio/backend/Dockerfile` | Python multi-stage, copie shared/ |
| `studio-frontend` | `studio/frontend/Dockerfile` | `turbo prune` → Next.js standalone |

### 7.2 Docker Compose final

Voir spec.md section 9 pour le compose complet.

Points cles :
- **YAML anchors** (`x-engine-env: &engine-env`, `x-engine-depends: &engine-depends`) — elimine la duplication d'env vars entre les 4 services Engine
- **Single image build** — `modularmind/engine:latest` est build une seule fois par le service `engine`, puis reutilise par `celery-worker`, `celery-beat` et `pipeline-worker` via `image:` (pas de `build:` duplique)
- **Context: `..`** (racine du monorepo) pour les builds apps TS
- **Nginx single domain** — Chat, Ops et Engine sur la meme origine, SSE streaming sans config speciale
- **Healthchecks** sur tous les services (Engine, Celery, pipeline-worker)
- **Profils** : `chat`, `ops`, `ollama` pour le deploiement flexible

**Pourquoi ces optimisations :**
- Avant : 4x le meme `build:` dans le compose → Docker buildait 4 images identiques
- Avant : env vars (DATABASE_URL, REDIS_URL, etc.) copiees dans chaque service → risque de desync
- Apres : 1 build, 1 image, anchors YAML → compose plus lisible et plus maintenable

### 7.3 Docker Compose Studio

```yaml
# docker/docker-compose.studio.yml
services:
  studio-db:
    image: postgres:16-alpine
    volumes: [studio-postgres-data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: modularmind_studio
      POSTGRES_PASSWORD: ${STUDIO_DB_PASSWORD}

  studio-backend:
    build:
      context: ..
      dockerfile: studio/backend/Dockerfile
    depends_on: [studio-db]
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:${STUDIO_DB_PASSWORD}@studio-db:5432/modularmind_studio

  studio-frontend:
    build:
      context: ..
      dockerfile: studio/frontend/Dockerfile

  nginx:
    image: nginx:alpine
    volumes: [./nginx/studio.conf:/etc/nginx/conf.d/default.conf]
    ports: ["${STUDIO_PORT:-3000}:80"]

volumes:
  studio-postgres-data:
```

### 7.4 Makefile

```makefile
# ── Dev ──
dev:              docker compose -f docker/docker-compose.dev.yml up -d
dev-chat:         pnpm dev --filter=@modularmind/chat
dev-ops:          pnpm dev --filter=@modularmind/ops
dev-studio:       pnpm dev --filter=@modularmind/studio-frontend

# ── Build ──
build:            pnpm build
build-images:     docker compose -f docker/docker-compose.yml build

# ── Deploy client ──
deploy-client:    docker compose -f docker/docker-compose.yml --profile chat --profile ops up -d
deploy-engine:    docker compose -f docker/docker-compose.yml up -d

# ── Deploy studio ──
deploy-studio:    docker compose -f docker/docker-compose.studio.yml up -d

# ── Tests ──
test-engine:      cd engine/server && pytest
test-shared:      cd shared && pytest
test-ts:          pnpm test
test:             make test-shared && make test-engine && make test-ts

# ── DB ──
migrate-engine:   cd engine/server && alembic upgrade head
migrate-studio:   cd studio/backend && alembic upgrade head

# ── Utils ──
logs:             docker compose -f docker/docker-compose.yml logs -f
health:           curl -sf http://localhost/health | python -m json.tool
pipeline-status:  curl -sf http://localhost/api/v1/internal/monitoring/pipeline | python -m json.tool
```

### 7.5 Test E2E

Scenario complet :

1. `make deploy-client` → tout demarre (engine + chat + ops + infra + nginx)
2. `curl http://localhost/health` → OK
3. Aller sur `http://localhost/ops/setup` → creer le premier user
4. Aller sur `http://localhost/` → login → chat → envoyer message → reponse streamee
5. Aller sur `http://localhost/ops/monitoring` → verifier metriques + pipeline
6. Aller sur `http://localhost/ops/playground` → tester un agent
7. Depuis le Studio, push un agent → verifier qu'il apparait dans le chat et l'ops

**Critere de completion**: Deploiement one-command OK. Scenario E2E passe. Cookies fonctionnent (single domain).

---

## Phase 8 : Nettoyage & Documentation

### 8.1 Mettre a jour CLAUDE.md

Reecrire completement pour la V2 :
- Nouvelle structure (studio, engine, apps, packages, shared)
- Nouveaux patterns (pipeline EventBus, sync push, single domain)
- Nouvelles commandes (turbo, pnpm, make)
- Nouvelles conventions (modularmind_shared imports, basePath /ops)

### 8.2 Supprimer le code mort

- Verifier qu'aucun ancien pattern ne traine (sys.path hacks, platform-client, sync-service refs, WebSocket refs)
- Supprimer les fichiers non utilises (dont `executions/websocket.py` si pas deja fait en Phase 1.8b)
- Nettoyer les imports
- `ruff check` sur tout le Python
- `pnpm lint` sur tout le TypeScript

### 8.3 README

- README principal avec architecture V2
- README par composant (engine, chat, ops, studio)
- Guide de deploiement client (voir spec section 13)
- Guide de deploiement studio

### 8.4 Stabilisation et archive

**NE PAS archiver immediatement.**

1. Deployer V2 en production
2. Garder l'ancien repo deployable pendant **2 semaines minimum**
3. Valider : zero regression, performances OK, pipeline stable
4. Seulement apres : tag `v1-archived` et passer en read-only

---

## Ordre d'execution

```
Phase 0 (Setup)           ██░░░░░░░░  Fondations
Phase 1 (Engine)          ████████░░  Le plus critique (+ smoke test)
Phase 2 (Packages)        ██░░░░░░░░  Prerequis pour Phase 3+4
Phase 3 (Ops)             ████░░░░░░  Copier + adapter + playground + pipeline monitoring
Phase 4 (Chat)            ████░░░░░░  Nouveau code (Vite), scope limite
Phase 5 (Memory Pipeline) ████░░░░░░  Nouveau code (Redis Streams), DLQ, health
Phase 6 (Studio)          ███░░░░░░░  Copier + adapter sync push + offline queue
Phase 7 (Docker)          ███░░░░░░░  Integration finale (turbo prune, nginx, E2E)
Phase 8 (Cleanup)         ██░░░░░░░░  Polish + stabilisation 2 semaines
```

**Phases parallelisables** :
- Phase 3 (Ops) et Phase 4 (Chat) en parallele apres Phase 2
- Phase 5 (Pipeline) en parallele avec Phase 3/4/6
- Phase 6 (Studio) des que Phase 1 est terminee

```
Timeline:
Phase 0 ──► Phase 1 ──► Phase 2 ──┬──► Phase 3 (Ops)     ──┐
             (+ smoke)             ├──► Phase 4 (Chat)     ──┤
                                   └──► Phase 5 (Pipeline)  ─┤──► Phase 7 ──► Phase 8
                        Phase 1 ──────► Phase 6 (Studio)  ───┘     (E2E)    (2 semaines
                                                                              stabilisation)
```
