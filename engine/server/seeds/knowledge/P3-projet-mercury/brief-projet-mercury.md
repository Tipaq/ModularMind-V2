# Brief Projet — Mercury (API Gateway & Marketplace)

## Informations Générales

| Champ | Valeur |
|-------|--------|
| **Code projet** | MERCURY |
| **Sponsor** | David Chen (CTO) |
| **Chef de projet** | Nicolas Durand (Lead Backend) |
| **Date de lancement** | 2026-01-15 |
| **Date cible de livraison** | 2026-08-31 |
| **Budget** | 220 000 € |
| **Statut** | En cours — Phase 1/3 |

## Contexte

ModularMind expose actuellement une API REST monolithique via un seul service FastAPI. L'ensemble des endpoints (auth, conversations, RAG, memory, agents) sont dans le même processus. Cette architecture pose des limites pour l'ouverture de la plateforme :

- **Pas d'API publique** : les clients enterprise veulent intégrer ModularMind dans leurs outils
- **Pas de rate limiting granulaire** : impossible de limiter par client/plan/endpoint
- **Pas de marketplace** : les templates d'agents et graphes sont gérés manuellement
- **Pas d'API keys** : seule l'auth par cookie est supportée

## Objectifs

1. **API Gateway** : couche Kong/KrakenD devant l'Engine pour le routing, rate limiting, et API key management
2. **API publique documentée** : OpenAPI 3.1, SDK TypeScript et Python auto-générés
3. **Marketplace de templates** : catalogue de templates d'agents, graphes, et plugins MCP partagés par la communauté
4. **Système de plugins MCP** : interface pour installer/configurer des outils MCP tiers
5. **Plan-based rate limiting** : limites différenciées par plan (Free, Pro, Enterprise)

## Architecture Cible

```
Client SDK ──→ API Gateway (Kong) ──→ Engine (FastAPI)
                   │
                   ├── Rate limiting (par API key + plan)
                   ├── Auth (API key OU cookie session)
                   ├── Request logging
                   └── Versioning (Accept-Version header)

Platform ──→ Marketplace Service ──→ Template Registry (PostgreSQL)
                   │
                   ├── Template CRUD
                   ├── Version management
                   ├── Rating & reviews
                   └── Installation flow
```

## Phases

### Phase 1 — API Gateway + API Keys (2026-01-15 → 2026-04-15) 🔄

**En cours.** Objectifs :
- Déployer Kong comme API Gateway devant l'Engine
- Implémenter le système d'API keys (génération, rotation, scoping)
- Rate limiting par plan (Free: 60 req/min, Pro: 600 req/min, Enterprise: custom)
- Documentation OpenAPI 3.1 auto-générée depuis FastAPI
- SDK TypeScript auto-généré (openapi-typescript-codegen)

### Phase 2 — Marketplace Backend (2026-04-16 → 2026-07-15)
- Modèle de données : Template, TemplateVersion, TemplateReview, TemplateInstall
- API CRUD pour les templates
- Système de versioning sémantique
- Processus de review/validation par l'équipe ModularMind
- Intégration avec le Graph Studio pour l'import one-click

### Phase 3 — Marketplace Frontend + SDK (2026-07-16 → 2026-08-31)
- UI marketplace dans Platform (browsing, search, install)
- SDK Python auto-généré
- Developer portal (docs, playground, API explorer)
- Programme beta développeurs (50 early adopters)

## Rate Limiting par Plan

| Plan | Requests/min | Requests/jour | Conversations/mois | Storage RAG |
|------|-------------|---------------|---------------------|-------------|
| Free | 60 | 5 000 | 100 | 100 MB |
| Pro | 600 | 100 000 | 5 000 | 10 GB |
| Enterprise | Custom | Custom | Unlimited | 100 GB+ |

## API Key Format

```
mmk_{environment}_{random_32_chars}

Exemples :
- mmk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
- mmk_test_z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4
```

Chaque API key est liée à :
- Un `tenant_id` (organisation)
- Un `plan` (Free, Pro, Enterprise)
- Des `scopes` (conversations:read, conversations:write, rag:search, etc.)
- Une `expires_at` optionnelle

## Equipe

| Rôle | Nom | Allocation |
|------|-----|------------|
| Lead Backend | Nicolas Durand | 80% |
| Backend Dev | Elise Moreau | 100% |
| Backend Dev | Karim Hadj | 100% |
| Frontend Dev (Phase 3) | Sophie Bernard | 40% |
| Product Owner | Marie Dupont | 20% |

## Risques

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Latence ajoutée par Kong | Moyen | Faible | Benchmark : < 5ms overhead |
| Complexité de la migration auth (cookie → API key) | Elevé | Moyen | Coexistence des 2 mécanismes |
| Adoption marketplace faible | Moyen | Moyen | Programme beta + incentives |
| Sécurité API keys (fuite/abus) | Critique | Faible | Rotation auto, alerting, scoping granulaire |
