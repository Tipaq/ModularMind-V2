# PRD — Éditeur de graphes visuels

## Résumé

L'éditeur de graphes permet aux administrateurs de concevoir visuellement des workflows d'agents IA en connectant des nœuds (LLM, outils, mémoire, RAG, conditions) sur un canevas interactif.

## Problème

Configurer des workflows complexes (RAG + mémoire + outils + conditions) nécessite aujourd'hui de modifier des fichiers JSON manuellement. C'est source d'erreurs, lent, et inaccessible aux non-développeurs.

## User Stories

1. **En tant qu'opérateur**, je veux créer des workflows visuellement sans écrire de code.
2. **En tant qu'opérateur**, je veux tester un workflow en temps réel avant de le publier.
3. **En tant qu'opérateur**, je veux utiliser des templates de workflows préconfigurés.
4. **En tant que développeur**, je veux exporter/importer des graphes en JSON.

## Fonctionnalités clés

### Canevas interactif
- Drag & drop de nœuds depuis une palette
- Connexion par glisser-déposer entre les ports
- Zoom, pan, et mini-map pour les grands graphes
- Undo/redo illimité
- Raccourcis clavier pour toutes les actions

### Types de nœuds
- **Entry** : Point d'entrée (obligatoire, unique)
- **LLM** : Appel à un modèle de langage
- **Tool** : Exécution d'un outil MCP
- **Condition** : Branchement binaire (vrai/faux)
- **Router** : Routage multi-chemin
- **RAG** : Recherche dans la base de connaissances
- **Memory** : Lecture/écriture mémoire
- **Transform** : Transformation de données
- **Exit** : Point de sortie

### Test en temps réel
- Bouton "Test" pour exécuter le graphe avec un message de test
- Visualisation nœud par nœud de l'exécution
- Inspection de l'état à chaque étape
- Coloration vert/rouge selon le succès/échec

### Templates
- Bibliothèque de templates préconfigurés
- "Chat simple" : Entry → LLM → Exit
- "RAG Chat" : Entry → RAG → LLM → Exit
- "Support avec escalade" : Entry → RAG → Memory → LLM → Condition → Exit/Escalade
- Possibilité de sauvegarder ses propres templates

### Versioning
- Chaque modification crée une nouvelle version
- Historique des versions consultable
- Rollback à une version précédente en un clic
- Comparaison diff entre versions

## Timeline

| Phase | Livrable | Date |
|-------|----------|------|
| Phase 1 | Canevas basique, nœuds LLM/RAG/Exit | v3.0 |
| Phase 2 | Tous les nœuds, test en temps réel | v3.1 |
| Phase 3 | Templates, versioning, collaboration | v3.3 (planifié) |