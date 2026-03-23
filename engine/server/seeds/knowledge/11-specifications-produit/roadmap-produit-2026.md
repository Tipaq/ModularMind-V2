# Roadmap produit — ModularMind 2026

## Vision

Faire de ModularMind la plateforme de référence pour l'orchestration d'agents IA en entreprise, avec un focus sur la facilité d'utilisation, la sécurité des données, et la flexibilité multi-modèles.

## Q1 2026 (Janvier — Mars)

### Thème : Mémoire et personnalisation

| Feature | Priorité | Équipe | Status |
|---------|----------|--------|--------|
| Memory Graph Visualization | P0 | Backend + Frontend | Livré (v3.2) |
| Semantic Chunking | P0 | Backend | Livré (v3.2) |
| Multi-Provider Fallback | P0 | Backend | Livré (v3.2) |
| Secondary accent derivation | P1 | Frontend | Livré (v3.2) |
| Memory type classification (semantic/episodic/procedural) | P1 | Backend | Livré (v3.2) |
| Active instances monitoring | P1 | Ops | Livré (v3.2) |

### Objectifs clés Q1
- Taux de recall mémoire > 80%
- Qualité RAG améliorée de 20% avec semantic chunking
- Zéro downtime lors des changements de provider (fallback automatique)

## Q2 2026 (Avril — Juin)

### Thème : Productivité et collaboration

| Feature | Priorité | Équipe | Status |
|---------|----------|--------|--------|
| Template marketplace (v1 — templates intégrés) | P0 | Full-stack | En cours |
| Graph editor improvements (undo/redo, templates) | P0 | Frontend | En cours |
| Agent analytics dashboard | P1 | Backend + Ops | Planifié |
| Conversation sharing | P1 | Full-stack | Planifié |
| Incremental document reindexing | P2 | Backend | Planifié |
| Memory procedural type | P2 | Backend | Planifié |

### Objectifs clés Q2
- 5 templates officiels disponibles
- Temps de création d'un agent réduit de 50% (grâce aux templates)
- Dashboard analytics utilisé par 80% des admins

## Q3 2026 (Juillet — Septembre)

### Thème : Échelle et performance

| Feature | Priorité | Équipe | Status |
|---------|----------|--------|--------|
| Multi-worker scaling (Redis Streams consumer groups) | P0 | Backend | Planifié |
| Batch conversation export | P1 | Backend | Planifié |
| Custom embedding models | P1 | Backend | Planifié |
| Graph execution replay/debug | P1 | Full-stack | Planifié |
| SSO SAML integration | P1 | Platform | Planifié |
| Mobile-responsive chat | P2 | Frontend | Planifié |

### Objectifs clés Q3
- Support de 1000+ conversations simultanées
- Onboarding client < 1 jour (avec templates + SSO)

## Q4 2026 (Octobre — Décembre)

### Thème : Communauté et ouverture

| Feature | Priorité | Équipe | Status |
|---------|----------|--------|--------|
| Template marketplace (v2 — publication communautaire) | P0 | Full-stack | Planifié |
| Plugin system pour custom nodes | P1 | Backend | Planifié |
| Multi-language UI (i18n) | P1 | Frontend | Planifié |
| Advanced RAG (auto-refresh, quality metrics) | P1 | Backend | Planifié |
| Audit log export (compliance) | P2 | Backend | Planifié |

## Risques et dépendances

| Risque | Impact | Mitigation |
|--------|--------|-----------|
| Évolution rapide des APIs LLM | Changements fréquents des providers | Couche d'abstraction multi-provider |
| Scaling Qdrant > 10M vectors | Performance dégradée | Benchmark trimestriel, plan de sharding |
| Réglementation IA (AI Act) | Nouvelles exigences de conformité | Veille réglementaire, DPO dédié |
| Recrutement backend | Capacité de dev limitée | Pipeline de recrutement actif, freelances |

## KPIs 2026

| KPI | Cible Q4 2026 | Actuel |
|-----|---------------|--------|
| Clients payants | 50 | 18 |
| MRR (Monthly Recurring Revenue) | 150K€ | 45K€ |
| Agents actifs (tous clients) | 500+ | 120 |
| Uptime | 99.95% | 99.92% |
| NPS | > 50 | 42 |