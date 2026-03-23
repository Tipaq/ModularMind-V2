# Standards de code review — ModularMind

## Objectifs du code review

1. **Qualité** : Détecter les bugs, les problèmes de performance, et les failles de sécurité
2. **Cohérence** : S'assurer que le code suit les conventions de l'équipe
3. **Partage de connaissances** : Permettre à tous de comprendre les changements
4. **Mentorat** : Aider les développeurs à progresser

## Responsabilités du reviewer

### Ce qu'il faut vérifier

| Catégorie | Points à vérifier |
|-----------|-------------------|
| **Correctness** | Le code fait-il ce qu'il est censé faire ? |
| **Security** | Pas d'injection SQL, XSS, secrets hardcodés ? |
| **Performance** | Requêtes N+1, boucles inutiles, mémoire ? |
| **Tests** | Les tests couvrent-ils les cas importants ? |
| **Naming** | Les noms de variables/fonctions sont-ils clairs ? |
| **Simplicity** | Le code est-il aussi simple que possible ? |
| **Conventions** | Respect du guide de style (Python/TypeScript) ? |
| **UI** | Semantic tokens utilisés (pas de couleurs hardcodées) ? |

### Ce qu'il ne faut PAS faire

- Ne pas bloquer une PR pour des préférences stylistiques mineures
- Ne pas demander des refactors hors scope de la PR
- Ne pas approuver sans avoir lu le code ("LGTM" sans review)
- Ne pas être condescendant ou agressif dans les commentaires

## Responsabilités de l'auteur

1. **Description claire** : Le PR description doit expliquer le "pourquoi"
2. **Petites PRs** : Visez < 300 lignes de changements
3. **Tests inclus** : Ajoutez les tests avec le code, pas séparément
4. **Self-review** : Relisez votre code avant de demander une review
5. **Réactivité** : Répondez aux commentaires sous 24h

## Format des commentaires

### Préfixes

| Préfixe | Signification | Bloquant ? |
|---------|---------------|-----------|
| `blocker:` | Problème critique à corriger | Oui |
| `suggestion:` | Amélioration proposée | Non |
| `question:` | Besoin de clarification | Potentiellement |
| `nit:` | Détail cosmétique mineur | Non |
| `praise:` | Compliment sur une bonne solution | Non |

### Exemples

```
blocker: This SQL query is vulnerable to injection. Use parameterized queries.

suggestion: Consider using `asyncio.gather()` here to run these two queries
in parallel instead of sequentially. Would reduce latency by ~50%.

question: Why did we choose to cache this for 1 hour? The data changes
frequently — would 5 minutes be more appropriate?

nit: Missing trailing comma on line 45 (not caught by formatter).

praise: Great use of the circuit breaker pattern here! Very clean implementation.
```

## Checklist de sécurité

Pour chaque PR, le reviewer doit vérifier :

- [ ] Pas de secrets dans le code (API keys, passwords, tokens)
- [ ] Pas d'injection SQL (utilisation de paramètres liés)
- [ ] Pas de XSS (sanitization des inputs utilisateur)
- [ ] Pas de données sensibles dans les logs
- [ ] Authentification et autorisation correctes
- [ ] Rate limiting en place pour les endpoints publics
- [ ] Validation des entrées (taille, format, type)

## Délais de réponse

| Urgence | Temps de réponse attendu |
|---------|-------------------------|
| Hotfix (production down) | < 2 heures |
| Bug fix critique | < 1 jour |
| Feature normale | < 2 jours |
| Refactoring / docs | < 3 jours |