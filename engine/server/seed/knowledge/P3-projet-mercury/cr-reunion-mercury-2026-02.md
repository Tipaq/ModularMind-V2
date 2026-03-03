# Compte-Rendu — Réunion Projet Mercury

**Date :** 2026-02-25
**Participants :** Nicolas Durand (Lead), Elise Moreau, Karim Hadj, Marie Dupont
**Durée :** 1h00
**Rédacteur :** Nicolas Durand

## Ordre du jour

1. Avancement Phase 1 (semaines 4-6)
2. Choix Kong vs KrakenD vs Traefik
3. Design du système d'API keys
4. Planning Sprint 4

## 1. Avancement Phase 1

### Terminé
- **Benchmark API Gateways** : Kong, KrakenD, et Traefik testés en staging. Voir point 2 pour les résultats.
- **Modèle de données API keys** : schéma PostgreSQL validé par l'équipe. Migration Alembic prête.
- **OpenAPI 3.1 spec** : extraction automatique depuis FastAPI. 47 endpoints documentés, 12 schemas.
- **Scoping system** : implémentation des scopes API (9 scopes définis). Middleware FastAPI pour la vérification.

### En cours
- **Kong deployment** : Karim finalise le Helm chart Kong (configuration declarative). ETA: fin de semaine.
- **API key generation endpoint** : Elise implémente le CRUD API keys. ETA: Sprint 4.
- **Rate limiting Redis** : intégration du plugin Kong rate-limiting avec notre Redis existant.

## 2. Choix Kong vs KrakenD vs Traefik

Karim a présenté les résultats du benchmark :

### Résultats

| Critère | Kong | KrakenD | Traefik |
|---------|------|---------|---------|
| Latence ajoutée (P50) | 3ms | 1ms | 4ms |
| Latence ajoutée (P99) | 8ms | 3ms | 12ms |
| Throughput max | 15K req/s | 25K req/s | 10K req/s |
| Plugins rate limiting | ✅ Redis-backed | ✅ In-memory | ✅ Redis-backed |
| Plugin API key auth | ✅ Natif | ❌ Custom | ✅ Natif (basique) |
| Config declarative | ✅ kong.yaml | ✅ krakend.json | ✅ YAML/TOML |
| Dashboard admin | ✅ Kong Manager (payant) / Konga (OSS) | ❌ | ✅ Traefik Dashboard |
| Communauté | Large | Moyenne | Large |
| K8s ingress controller | ✅ | ❌ | ✅ |
| Complexité opérationnelle | Moyenne (nécessite PostgreSQL) | Faible (stateless) | Faible |

### Analyse

- **KrakenD** est le plus performant mais ne supporte pas l'API key auth nativement — il faudrait écrire un plugin custom en Go. Risque de maintenance.
- **Kong** est le plus complet en features mais ajoute une dépendance PostgreSQL (on en a déjà un, mais c'est une DB séparée pour Kong). Mode DB-less possible avec config declarative.
- **Traefik** est le plus simple mais le rate limiting est moins flexible et la latence P99 est élevée.

### Décision

**Kong en mode DB-less** (configuration declarative via `kong.yaml`).

Raisons :
1. API key auth natif — pas de code custom
2. Rate limiting Redis-backed — cohérent avec notre infra
3. Mode DB-less élimine la dépendance PostgreSQL supplémentaire
4. Future-proof : si on a besoin de features avancées (canary, GraphQL), Kong les supporte
5. Latence acceptable (3ms P50)

## 3. Design du Système d'API Keys

### Flow de Génération

```
1. User (Platform) → POST /api-keys → Génère random 32 chars
2. Stocke SHA-256(key) en DB (jamais le plaintext)
3. Retourne la key au user UNE SEULE FOIS
4. User stocke la key dans son .env
```

### Sécurité

- **Hashing** : SHA-256 du key complet. Le prefix (`mmk_live_a1b2`) est stocké en clair pour l'identification visuelle.
- **Rotation** : endpoint `POST /api-keys/{id}/rotate` qui crée une nouvelle key et invalide l'ancienne après un grace period de 24h.
- **Alerting** : si une key est utilisée depuis > 10 IPs différentes en 1h, alerte automatique.
- **Expiration** : optionnelle, recommandée à 90 jours pour les keys de test.

### Discussion

Marie a demandé si on pouvait supporter les "team API keys" partagées par une équipe. Après discussion, on décide de **ne pas** implémenter ça en Phase 1 — trop de complexité (qui a fait quoi, audit trail). Chaque key est liée à un user. Les permissions sont héritées du plan du tenant.

## 4. Planning Sprint 4 (2026-03-01 → 2026-03-14)

| Tâche | Assigné | Points |
|-------|---------|--------|
| Déploiement Kong en staging (Helm chart) | Karim | 5 |
| CRUD API keys (génération, rotation, révocation) | Elise | 8 |
| Middleware scope verification dans FastAPI | Nicolas | 5 |
| Intégration Kong rate-limiting + Redis | Karim | 3 |
| Tests d'intégration Gateway → Engine | Elise | 5 |
| Documentation API publique (Swagger UI) | Nicolas | 3 |

## Actions

| Action | Responsable | Deadline |
|--------|-------------|----------|
| Finaliser Helm chart Kong | Karim | 2026-03-03 |
| PR migration Alembic pour table api_keys | Elise | 2026-03-01 |
| Rédiger la doc développeur (Getting Started) | Nicolas | 2026-03-14 |
| Valider le design des scopes avec l'équipe Product | Marie | 2026-03-07 |

## Prochaine Réunion

**Date :** 2026-03-11, 15h00
**Sujet :** Démo API keys + revue rate limiting
