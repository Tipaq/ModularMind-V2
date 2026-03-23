# PRD — Monitoring et analytics

## Résumé

Le système de monitoring fournit une visibilité en temps réel sur les performances, l'utilisation, et les coûts de la plateforme ModularMind.

## Problème

Les administrateurs n'ont pas de visibilité sur :
- Les performances des agents (latence, taux d'erreur)
- L'utilisation des modèles LLM (tokens consommés, coûts)
- La qualité du RAG (pertinence des résultats)
- L'état de santé de l'infrastructure

## Dashboards planifiés

### Vue d'ensemble
- Conversations actives, messages/heure, utilisateurs uniques
- Latence moyenne et taux d'erreur
- Top 5 agents par volume
- Alertes actives

### Détail par agent
- Volume de messages et conversations
- Latence P50/P95/P99
- Taux de fallback (changement de modèle)
- Satisfaction (si feedback activé)
- Sources RAG les plus utilisées
- Mémoires les plus rappelées

### Coûts LLM
- Tokens consommés par provider/modèle/jour
- Coût estimé par provider
- Coût par conversation (moyenne)
- Prévision de coût mensuel
- Alertes de dépassement de budget

### Infrastructure
- Santé de chaque service (Engine, Worker, DB, Redis, Qdrant)
- Métriques système (CPU, RAM, disque, réseau)
- Profondeur des streams Redis
- Taille des collections Qdrant

## Métriques clés

| Métrique | Source | Agrégation |
|----------|--------|------------|
| `http_request_duration_seconds` | Engine Prometheus | Histogram (P50, P95, P99) |
| `llm_tokens_total` | Engine counter | Sum par provider/model/direction |
| `rag_search_duration_seconds` | Engine histogram | P50, P95 |
| `memory_recall_duration_seconds` | Engine histogram | P50, P95 |
| `stream_pending_messages` | Redis XLEN | Gauge per stream |
| `qdrant_points_count` | Qdrant API | Gauge per collection |

## Exigences non-fonctionnelles

| Exigence | Cible |
|----------|-------|
| Rafraîchissement dashboard | 15 secondes |
| Rétention des métriques | 90 jours (détaillé), 2 ans (agrégé) |
| Alertes | < 1 minute de détection |

## Timeline

| Phase | Livrable | Date |
|-------|----------|------|
| Phase 1 | Dashboard overview + métriques Prometheus | v3.1 |
| Phase 2 | Dashboard agents + coûts LLM | v3.2 |
| Phase 3 | Analytics avancés, exports, rapports planifiés | v3.3 |