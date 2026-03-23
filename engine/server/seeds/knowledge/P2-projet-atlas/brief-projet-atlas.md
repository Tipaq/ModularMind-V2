# Brief Projet — Atlas (Migration Kubernetes)

## Informations Générales

| Champ | Valeur |
|-------|--------|
| **Code projet** | ATLAS |
| **Sponsor** | David Chen (CTO) |
| **Chef de projet** | Julien Morel (Lead DevOps) |
| **Date de lancement** | 2025-10-15 |
| **Date cible de livraison** | 2026-05-31 |
| **Budget** | 350 000 € |
| **Statut** | En cours — Phase 2/3 |

## Contexte

L'infrastructure actuelle de ModularMind repose sur Docker Compose déployé sur des VMs OVH dédiées. Cette architecture a atteint ses limites :

- **Scalabilité** : impossible de scaler horizontalement l'Engine sans downtime
- **Disponibilité** : SLA actuel de 99.5%, objectif client enterprise de 99.9%
- **Déploiement** : rolling updates manuels, downtime de 2-5 minutes par déploiement
- **Coûts** : VMs surdimensionnées pour absorber les pics, utilisation moyenne de 35%
- **Multi-tenant** : pas d'isolation réseau entre les clients enterprise

## Objectifs

1. **Migrer vers Kubernetes (K8s)** sur OVH Managed Kubernetes
2. **Atteindre 99.9% de disponibilité** avec auto-healing et rolling deployments
3. **Auto-scaling** : scale l'Engine de 2 à 20 pods selon la charge
4. **Zero-downtime deployments** avec stratégie canary
5. **Isolation multi-tenant** via namespaces et network policies
6. **Réduire les coûts infra de 30%** grâce au right-sizing

## Architecture Cible

```
                    ┌─────────────────────────────────┐
                    │     OVH Managed Kubernetes       │
                    │                                   │
    Internet ──→ Ingress (Nginx) ──→ ┌─────────────┐  │
                    │                 │ mm-production │  │
                    │                 │  namespace     │  │
                    │                 │               │  │
                    │   ┌─────────┐  │ engine (2-20) │  │
                    │   │ cert-   │  │ worker (1-5)  │  │
                    │   │ manager │  │ nginx (2)     │  │
                    │   └─────────┘  └─────────────┘  │
                    │                                   │
                    │   ┌─────────────┐ ┌───────────┐  │
                    │   │ mm-staging  │ │ mm-infra   │  │
                    │   │ namespace   │ │ namespace  │  │
                    │   │             │ │            │  │
                    │   │ engine (1)  │ │ postgres   │  │
                    │   │ worker (1)  │ │ redis      │  │
                    │   └─────────────┘ │ qdrant     │  │
                    │                   │ prometheus │  │
                    │                   │ grafana    │  │
                    │                   └───────────┘  │
                    └─────────────────────────────────┘
```

## Phases

### Phase 1 — Préparation (2025-10-15 → 2025-12-31) ✅
- Containerisation optimisée (images multi-stage, < 200 MB)
- Helm charts pour tous les services
- CI/CD GitHub Actions → build + push images
- Cluster K8s de dev sur OVH
- Migration PostgreSQL vers CloudNativePG operator
- Tests de charge baseline sur l'infra actuelle

### Phase 2 — Migration Staging (2026-01-01 → 2026-03-31) 🔄
- Déploiement staging sur K8s
- Migration Redis vers Redis Sentinel (HA)
- Migration Qdrant vers cluster mode (3 nœuds)
- HPA (Horizontal Pod Autoscaler) pour Engine
- Network policies inter-namespaces
- Monitoring K8s (Prometheus + Grafana)
- Tests de charge sur staging K8s

### Phase 3 — Migration Production (2026-04-01 → 2026-05-31)
- Migration données PostgreSQL (pg_dump + restore)
- Migration collections Qdrant (snapshot + restore)
- Bascule DNS progressive (canary 10% → 50% → 100%)
- Validation SLA 99.9% pendant 2 semaines
- Décommissionnement VMs OVH
- Documentation opérationnelle finale

## Equipe

| Rôle | Nom | Allocation |
|------|-----|------------|
| Lead DevOps | Julien Morel | 100% |
| DevOps Engineer | Pierre Girard | 100% |
| Backend Lead | Nicolas Durand | 30% |
| DBA | Aisha Benali | 40% |
| SRE | Maxime Faure | 60% |

## Risques

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Perte de données pendant la migration PG | Critique | Faible | Réplication synchrone + backup pre-migration |
| Surcoût K8s par rapport aux VMs | Moyen | Moyen | POC coûts réalisé en Phase 1, budget marge 15% |
| Latence réseau accrue (pod-to-pod vs localhost) | Moyen | Moyen | Benchmark en Phase 2, optimisation sidecar |
| Complexité opérationnelle K8s | Elevé | Elevé | Formation équipe, runbooks détaillés |
| Incompatibilité Ollama en K8s (GPU scheduling) | Elevé | Moyen | Test GPU node pool en Phase 2 |

## Budget Détaillé

| Poste | Montant |
|-------|---------|
| OVH Managed K8s (cluster) | 1 200 €/mois |
| Node pool standard (3x b2-30) | 450 €/mois |
| Node pool GPU (1x t1-45 pour Ollama) | 800 €/mois |
| Stockage persistant (500 GB) | 75 €/mois |
| Load Balancer | 20 €/mois |
| Backup S3 (OVH Object Storage) | 30 €/mois |
| **Total infra mensuel** | **2 575 €/mois** |
| **vs. actuel (VMs dédiées)** | **3 400 €/mois** |
| **Economie mensuelle** | **825 €/mois (-24%)** |
