# Premiers pas — Contribuer au codebase ModularMind

## Objectif

Ce tutoriel vous guide dans votre première contribution au codebase ModularMind : du choix d'une issue à la fusion de votre Pull Request.

## Étape 1 : Choisir une issue

1. Ouvrez le board Jira : modularmind.atlassian.net
2. Filtrez par le label **"good first issue"**
3. Choisissez une issue qui vous intéresse
4. Assignez-vous l'issue et passez-la en "In Progress"

Pour votre première contribution, privilégiez :
- Corrections de bugs simples
- Ajout de tests manquants
- Améliorations de documentation
- Petites features bien définies

## Étape 2 : Créer une branche

```bash
# Assurez-vous d'être à jour
git checkout develop
git pull origin develop

# Créez votre branche
git checkout -b feature/MM-123-add-search-filter
```

Convention de nommage : `{type}/MM-{ticket}-{description-courte}`
Types : `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`

## Étape 3 : Développer

### Backend (Python)

```bash
cd engine/server
source .venv/bin/activate
# Votre éditeur devrait détecter le venv automatiquement
```

Points à retenir :
- Imports : `from src.xxx` pour le code engine
- Style : ruff lint + format automatique
- Async : toutes les fonctions DB/API sont `async`
- Tests : ajoutez-les dans `tests/unit/` ou `tests/integration/`

### Frontend (TypeScript)

```bash
# Le hot reload est automatique avec Vite
make dev-chat  # ou make dev-ops
```

Points à retenir :
- Components : function components (pas de `React.FC`)
- Style : semantic tokens uniquement (`bg-primary`, pas `bg-blue-500`)
- Imports : `@modularmind/ui` pour les composants partagés
- `"use client"` : obligatoire pour les composants avec hooks dans `packages/ui`

## Étape 4 : Tester

```bash
# Tests Python
cd engine/server
pytest tests/ -v

# Tests TypeScript
pnpm turbo test

# Linting complet
make lint
```

## Étape 5 : Commiter

Suivez les **Conventional Commits** :

```bash
git add src/rag/retriever.py tests/unit/test_retriever.py
git commit -m "feat(rag): add collection filter to search endpoint

Add ability to filter RAG search results by collection ID.
The filter is applied at the Qdrant query level for performance.

Closes MM-123"
```

## Étape 6 : Créer la Pull Request

```bash
git push origin feature/MM-123-add-search-filter
```

Puis sur GitHub, créez une PR avec :

**Titre :** `feat(rag): add collection filter to search endpoint`

**Description :**
```markdown
## Summary
- Added `collection_ids` filter parameter to POST /rag/search
- Filter applied at Qdrant payload level for performance
- Updated schema validation and tests

## Testing
- Added unit test for filtered search
- Tested manually with 3 collections

## Checklist
- [x] Tests added
- [x] Linting passes
- [x] No hardcoded colors
```

## Étape 7 : Code review

1. Assignez 1-2 reviewers (votre buddy + un membre de l'équipe)
2. Répondez aux commentaires sous 24h
3. Poussez les corrections demandées
4. Une fois approuvé, le reviewer (ou vous) merge via **Squash and merge**

## Étape 8 : Après le merge

1. Passez l'issue en "Done" sur Jira
2. Vérifiez que le CI passe sur `develop`
3. Si les changements sont visibles, vérifiez sur staging après le déploiement automatique

## Bonnes pratiques pour les nouvelles contributions

1. **Petites PRs** : Visez < 300 lignes. Si c'est plus grand, découpez en plusieurs PRs.
2. **Tests d'abord** : Écrivez les tests avant ou en même temps que le code.
3. **Demandez de l'aide** : N'hésitez pas à poser des questions sur #engineering ou #help-desk.
4. **Lisez le code existant** : Avant de coder, comprenez les patterns en place.
5. **Ne sur-engineerez pas** : Faites la chose la plus simple qui fonctionne.