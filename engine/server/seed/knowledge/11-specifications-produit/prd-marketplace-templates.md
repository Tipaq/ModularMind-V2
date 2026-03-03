# PRD — Marketplace de templates

## Résumé

La Marketplace de templates permet aux utilisateurs de partager et réutiliser des configurations d'agents et de graphes pré-construits.

## Problème

Créer un agent performant nécessite de l'expertise (prompt engineering, configuration RAG, choix du modèle). Les nouveaux utilisateurs passent beaucoup de temps à expérimenter. Une marketplace de templates permettrait de capitaliser sur les meilleures configurations.

## User Stories

1. **En tant qu'opérateur**, je veux installer un template d'agent en un clic.
2. **En tant qu'opérateur**, je veux partager mes configurations d'agents avec la communauté.
3. **En tant qu'administrateur**, je veux contrôler quels templates sont disponibles dans mon instance.
4. **En tant que ModularMind**, nous voulons proposer des templates officiels pour les cas d'usage courants.

## Templates prévus (v1)

### Agents
| Template | Description | Modèle recommandé |
|----------|-------------|-------------------|
| Support Client | Chatbot FAQ avec escalade | gpt-4o-mini |
| Code Review | Analyse de code avec suggestions | claude-sonnet-4-6 |
| Rédacteur technique | Aide à la rédaction de documentation | gpt-4o |
| Analyste données | Requêtes SQL et visualisation | gpt-4o |
| Onboarding buddy | Assistant pour les nouveaux employés | llama3.1:8b |

### Graphes
| Template | Description | Complexité |
|----------|-------------|-----------|
| Chat simple | Entry → LLM → Exit | Débutant |
| RAG Chat | Entry → RAG → LLM → Exit | Débutant |
| Support avec mémoire | RAG → Memory → LLM → Memory Write | Intermédiaire |
| Multi-agent router | Router → Agent spécialisé → Exit | Avancé |
| Pipeline d'analyse | Input → Tool (SQL) → LLM (analyse) → Exit | Avancé |

## Fonctionnalités

### Installation
1. Parcourir la marketplace (catégories, recherche, filtres)
2. Prévisualiser le template (prompt, graphe, configuration)
3. Installer en un clic (crée l'agent/graphe dans l'instance)
4. Personnaliser après installation (modifier le prompt, changer le modèle)

### Publication
1. Sélectionner un agent/graphe existant
2. Rédiger une description et des instructions
3. Choisir la visibilité : privé (instance), public (marketplace)
4. Soumettre pour review (templates publics)

### Versioning
- Chaque template a un numéro de version (semver)
- Notification de mise à jour disponible
- Mise à jour sélective (conserver ses personnalisations)

## Timeline

| Phase | Livrable | Date |
|-------|----------|------|
| Phase 1 | Templates intégrés (5 agents, 5 graphes) | v3.3 |
| Phase 2 | Publication et installation | v3.4 |
| Phase 3 | Marketplace communautaire | v4.0 |