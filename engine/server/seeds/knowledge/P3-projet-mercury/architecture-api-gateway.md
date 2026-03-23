# Architecture API Gateway — Projet Mercury

## Vue d'ensemble

L'API Gateway se positionne entre les clients (SDKs, apps) et l'Engine FastAPI. Elle gère l'authentification, le rate limiting, le logging, et le versioning sans modifier le code de l'Engine.

```
                    ┌──────────────────────────────┐
                    │        API Gateway (Kong)     │
Clients ──HTTPS──→  │                              │ ──HTTP──→ Engine (FastAPI)
                    │  ┌─────────────────────────┐ │
                    │  │ Plugins:                 │ │
                    │  │  • key-auth              │ │
                    │  │  • rate-limiting          │ │
                    │  │  • request-transformer   │ │
                    │  │  • response-transformer  │ │
                    │  │  • prometheus             │ │
                    │  │  • cors                   │ │
                    │  │  • request-size-limiting  │ │
                    │  └─────────────────────────┘ │
                    └──────────────────────────────┘
```

## Kong Configuration

### Services & Routes

```yaml
# kong.yaml (declarative config)
_format_version: "3.0"

services:
  - name: engine-api
    url: http://engine:8000
    routes:
      - name: api-v1
        paths:
          - /api/v1
        strip_path: true
        headers:
          Accept-Version:
            - v1
      - name: api-latest
        paths:
          - /api
        strip_path: true

plugins:
  - name: key-auth
    config:
      key_names:
        - X-API-Key
        - apikey
      hide_credentials: true
    route: api-v1

  - name: rate-limiting
    config:
      minute: 60
      policy: redis
      redis_host: redis
      redis_port: 6379
    route: api-v1

  - name: cors
    config:
      origins:
        - "https://app.modularmind.io"
        - "https://*.modularmind.io"
      methods:
        - GET
        - POST
        - PUT
        - DELETE
        - OPTIONS
      headers:
        - Content-Type
        - Authorization
        - X-API-Key
        - Accept-Version
      exposed_headers:
        - X-RateLimit-Limit
        - X-RateLimit-Remaining
        - X-RateLimit-Reset
      max_age: 3600
```

## Modèle de Données API Keys

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    key_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 du key
    key_prefix VARCHAR(12) NOT NULL,        -- "mmk_live_a1b2" pour l'affichage
    name VARCHAR(100) NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    plan VARCHAR(20) NOT NULL DEFAULT 'free',
    rate_limit_minute INT,
    rate_limit_day INT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    usage_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
```

## Flow d'Authentification

### API Key (nouveaux clients)

```
Client ──→ Kong ──→ key-auth plugin ──→ lookup api_keys ──→ inject X-Tenant-ID header ──→ Engine
```

1. Le client envoie `X-API-Key: mmk_live_xxx`
2. Kong hash la clé (SHA-256) et la cherche dans la table `api_keys`
3. Vérifie : `is_active`, `expires_at`, scopes
4. Injecte les headers `X-Tenant-ID`, `X-Plan`, `X-Scopes` vers l'Engine
5. L'Engine fait confiance aux headers injectés par Kong (réseau interne)

### Cookie Session (apps existantes)

```
Browser ──→ Kong ──→ pass-through ──→ Engine (cookie auth existante)
```

Les apps Chat et Ops continuent d'utiliser l'auth par cookie. Kong ne touche pas aux cookies et forward directement vers l'Engine.

## Scopes API

| Scope | Description | Free | Pro | Enterprise |
|-------|-------------|------|-----|------------|
| `conversations:read` | Lister/lire les conversations | ✅ | ✅ | ✅ |
| `conversations:write` | Créer conversations, envoyer messages | ✅ | ✅ | ✅ |
| `conversations:delete` | Supprimer/archiver | ❌ | ✅ | ✅ |
| `rag:search` | Recherche dans le knowledge base | ✅ | ✅ | ✅ |
| `rag:manage` | Upload/delete documents et collections | ❌ | ✅ | ✅ |
| `memory:read` | Lire les mémoires | ❌ | ✅ | ✅ |
| `memory:write` | Créer/modifier des mémoires | ❌ | ❌ | ✅ |
| `agents:read` | Lister les agents disponibles | ✅ | ✅ | ✅ |
| `agents:manage` | Configurer les agents | ❌ | ❌ | ✅ |
| `admin:*` | Accès admin complet | ❌ | ❌ | ✅ |

## Rate Limiting Détaillé

### Stratégie Multi-Couche

```
Layer 1: Kong Global        → 1000 req/min par IP (protection DDoS)
Layer 2: Kong per API key   → Plan-based (60/600/custom req/min)
Layer 3: Engine per user    → Redis sliding window (existant)
```

### Headers de Réponse

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 542
X-RateLimit-Reset: 1709280360
```

### Réponse Rate Limit Exceeded

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 30

{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Retry after 30 seconds.",
    "plan": "free",
    "limit": 60,
    "reset_at": "2026-03-01T10:01:00Z"
  }
}
```

## SDK Auto-Généré

### TypeScript

```typescript
import { ModularMind } from '@modularmind/sdk';

const mm = new ModularMind({
  apiKey: 'mmk_live_xxx',
  baseUrl: 'https://api.modularmind.io/v1',
});

// Créer une conversation
const conv = await mm.conversations.create({
  agentId: 'agt_support01',
  metadata: { source: 'api' },
});

// Envoyer un message (streaming)
const stream = await mm.messages.create(conv.id, {
  content: 'Comment configurer le rate limiting?',
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

### Python

```python
from modularmind import ModularMind

mm = ModularMind(api_key="mmk_live_xxx")

# Recherche RAG
results = mm.rag.search(
    query="rate limiting configuration",
    collection_ids=["col_product_docs"],
    limit=5,
)

for result in results:
    print(f"[{result.score:.2f}] {result.chunk.content[:100]}...")
```

## Monitoring API Gateway

| Métrique | Type | Alerte |
|----------|------|--------|
| `kong_http_requests_total` | Counter | — |
| `kong_request_latency_ms` | Histogram | P99 > 100ms |
| `kong_bandwidth_bytes` | Counter | — |
| `api_key_usage_daily` | Counter | > 90% du plan |
| `rate_limit_exceeded_total` | Counter | > 100/min (possible abus) |
