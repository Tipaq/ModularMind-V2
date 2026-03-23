# Plan de Tests — Projet Mercury

## Stratégie

Le projet Mercury nécessite des tests particulièrement rigoureux sur la sécurité (API keys, scopes) et la fiabilité (rate limiting, gateway).

## 1. Tests API Gateway (Kong)

### Tests de Configuration

| Test | Description | Status |
|------|-------------|--------|
| Route vers Engine | Requête via Kong atteint l'Engine | ⬜ Planned |
| Header injection | Kong injecte X-Tenant-ID correctement | ⬜ Planned |
| CORS headers | Réponse contient les bons headers CORS | ⬜ Planned |
| TLS termination | HTTPS terminé au niveau Kong | ⬜ Planned |
| Path stripping | `/api/v1/conversations` → `/conversations` | ⬜ Planned |

### Tests de Performance

| Test | Seuil | Tool |
|------|-------|------|
| Latence ajoutée par Kong | P50 < 5ms, P99 < 15ms | k6 |
| Throughput avec rate limiting actif | > 10K req/s | k6 |
| Overhead mémoire Kong | < 256 MB | Prometheus |

## 2. Tests API Keys

### Tests Fonctionnels

| Test | Description | Status |
|------|-------------|--------|
| Génération | Créer une API key, vérifier le format mmk_* | ⬜ |
| Authentification | Requête avec X-API-Key header réussit | ⬜ |
| Key invalide | Requête avec key invalide → 401 | ⬜ |
| Key expirée | Key avec expires_at passé → 401 | ⬜ |
| Key révoquée | Key révoquée → 401 | ⬜ |
| Rotation | Nouvelle key fonctionne, ancienne invalide après grace period | ⬜ |
| Scopes | Key avec scope `rag:search` ne peut pas POST conversations | ⬜ |
| Multiple keys | Un user peut avoir plusieurs keys actives | ⬜ |

### Tests de Sécurité

| Test | Description | Status |
|------|-------------|--------|
| Brute force | 100 keys invalides → blocage IP temporaire | ⬜ |
| Key dans URL | API key dans query param est rejetée (force header) | ⬜ |
| Key dans logs | Vérifier que la key n'apparaît jamais dans les logs | ⬜ |
| Timing attack | Réponse temps constant pour key valide vs invalide | ⬜ |
| Key format | Seul le format mmk_{env}_{32chars} est accepté | ⬜ |

## 3. Tests Rate Limiting

### Tests Fonctionnels

| Test | Plan | Limit | Behaviour |
|------|------|-------|-----------|
| Free plan limit | Free | 60/min | 61ème requête → 429 |
| Pro plan limit | Pro | 600/min | 601ème requête → 429 |
| Headers présents | * | * | X-RateLimit-* dans chaque réponse |
| Reset timing | * | * | Counter reset après 60 secondes |
| Retry-After | * | * | Header Retry-After dans la 429 |

### Tests d'Edge Cases

| Test | Description |
|------|-------------|
| Concurrent requests | 100 requêtes simultanées, rate limit respecté |
| Redis down | Fallback : rate limit dégradé (local counter) |
| Key rotation | Le rate limit counter est transféré à la nouvelle key |
| Multiple keys same tenant | Chaque key a son propre counter |

## 4. Tests Marketplace

### Tests CRUD Templates

| Test | Description |
|------|-------------|
| Créer template agent | JSON valide, stocké en DB, slug généré |
| Créer template graph | Validation des nodes/edges |
| Créer template MCP | Vérification env_required |
| Publier version | Versioning sémantique respecté |
| Installer template | Config copiée dans le tenant |
| Désinstaller | Config retirée, pas d'effet de bord |
| Review | Rating 1-5, un review par user par template |

### Tests de Validation

| Test | Expected |
|------|----------|
| Template sans nom | 400 Bad Request |
| Version invalide (pas semver) | 400 Bad Request |
| Config avec secrets détectés | 400 + warning |
| Template dupliqué (même slug) | 409 Conflict |
| Install version incompatible | 400 + version minimale requise |

## 5. Tests d'Intégration E2E

### Parcours Complets

1. **Parcours développeur** :
   - Créer une API key → utiliser dans curl → recevoir une réponse → vérifier rate limit headers

2. **Parcours marketplace** :
   - Publier un template → le retrouver dans le catalogue → l'installer → vérifier qu'il fonctionne → le noter

3. **Parcours upgrade plan** :
   - Atteindre la limite Free → upgrade vers Pro → vérifier nouvelle limite

## Environnement de Test

| Env | Kong | Engine | DB |
|-----|------|--------|----|
| CI | Docker (kong:3.6) | Docker (engine:test) | PostgreSQL 16 (testcontainers) |
| Staging | K8s (Helm) | K8s | CloudNativePG |
