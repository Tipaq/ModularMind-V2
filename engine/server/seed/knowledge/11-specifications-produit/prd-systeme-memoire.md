# PRD — Système de mémoire conversationnelle

## Résumé

Le système de mémoire permet aux agents ModularMind de se souvenir des informations importantes des conversations passées pour fournir des réponses contextualisées et personnalisées.

## Problème

Actuellement, chaque conversation est indépendante. L'agent ne se souvient pas des préférences de l'utilisateur, de ses problèmes précédents, ou du contexte de ses projets. Cela oblige les utilisateurs à répéter les mêmes informations à chaque nouvelle conversation.

## User Stories

1. **En tant qu'utilisateur**, je veux que l'agent se souvienne de mes préférences (langue, format de réponse, outils préférés) pour ne pas avoir à les répéter.
2. **En tant qu'utilisateur**, je veux que l'agent se rappelle de mes problèmes précédents pour fournir un suivi contextuel.
3. **En tant qu'administrateur**, je veux pouvoir consulter et gérer les mémoires stockées par utilisateur.
4. **En tant qu'administrateur**, je veux configurer la durée de rétention et les règles de consolidation.

## Exigences fonctionnelles

### Extraction automatique
- Le système extrait automatiquement les faits importants des conversations
- Utilise un LLM dédié pour l'extraction (prompt spécialisé)
- Distingue les types : épisodique (événements), sémantique (faits), procédural (processus)
- Pipeline asynchrone via Redis Streams (pas d'impact sur la latence de chat)

### Rappel contextuel
- Avant chaque réponse, le système recherche les mémoires pertinentes
- Recherche hybride : dense vectors + BM25 dans Qdrant
- Scoring multi-facteurs : pertinence × récence × importance × fréquence d'accès
- Injection transparente dans le contexte du LLM

### Gestion des mémoires
- Dashboard admin avec vue par utilisateur, scope, tier
- Recherche et filtrage avancés
- Suppression manuelle (soft-delete avec expired_at)
- Visualisation du graphe de relations entre mémoires

### Consolidation
- Les mémoires similaires sont fusionnées automatiquement
- Hiérarchie de tiers : buffer → summary → vector → archive
- Journal de consolidation pour l'audit

## Exigences non-fonctionnelles

| Exigence | Cible |
|----------|-------|
| Latence de rappel | < 200ms P95 |
| Latence d'extraction | < 5s par message (async) |
| Capacité par utilisateur | 10 000+ mémoires |
| Disponibilité | 99.9% (dégradation gracieuse si Qdrant down) |

## Métriques de succès

| Métrique | Objectif | Mesure |
|----------|----------|--------|
| Pertinence des rappels | > 80% jugés utiles | Feedback utilisateur |
| Utilisation de la mémoire | > 30% des réponses enrichies | Metadata `memory_used` |
| Réduction des répétitions | -50% de questions redondantes | Analyse de conversations |

## Timeline

| Phase | Livrable | Date |
|-------|----------|------|
| Phase 1 | Extraction + rappel basique | v3.0 (Sept 2025) |
| Phase 2 | Multi-scope + consolidation | v3.1 (Déc 2025) |
| Phase 3 | Graphe de mémoire + visualisation | v3.2 (Fév 2026) |
| Phase 4 | Mémoire procédurale + routines | v3.3 (planifié) |