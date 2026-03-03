# Politique de gestion des secrets — ModularMind

## Principes fondamentaux

1. **Zéro secret dans le code** : Aucun secret ne doit apparaître dans le code source, les fichiers de configuration commités, ou les logs
2. **Moindre privilège** : Chaque service n'a accès qu'aux secrets dont il a besoin
3. **Rotation régulière** : Les secrets sont changés selon un calendrier défini
4. **Audit trail** : Chaque accès à un secret est tracé

## Classification des secrets

| Catégorie | Exemples | Rotation | Stockage |
|-----------|----------|----------|----------|
| Critique | JWT_SECRET, DB passwords | 90 jours | Vault + SSM |
| Élevé | API keys (OpenAI, Anthropic) | 180 jours | Vault + SSM |
| Moyen | SMTP credentials, Slack tokens | 365 jours | 1Password |
| Bas | Analytics keys, public API keys | Pas de rotation | .env (non commité) |

## Outils

### HashiCorp Vault (Production)

Vault est notre source de vérité pour les secrets en production :

```bash
# Lire un secret
vault kv get secret/modularmind/production/database

# Écrire un secret
vault kv put secret/modularmind/production/openai api_key=sk-...

# Lister les secrets
vault kv list secret/modularmind/production/
```

### AWS SSM Parameter Store (Cloud)

Pour les déploiements cloud, les secrets sont dans SSM :

```bash
# Lire
aws ssm get-parameter --name /modularmind/prod/jwt-secret --with-decryption

# Écrire
aws ssm put-parameter --name /modularmind/prod/jwt-secret   --type SecureString --value "new_secret_value"
```

### 1Password (Équipe)

Secrets partagés en équipe (staging, développement, services tiers) :
- Vault "ModularMind - Engineering"
- Accès par rôle (admin, backend, frontend, devops)
- Ne jamais copier-coller depuis 1Password vers Slack

### GitHub Secrets (CI/CD)

Secrets pour les pipelines CI/CD :
- Organization-level pour les secrets partagés
- Repository-level pour les secrets spécifiques
- Environment-level pour staging/production

## Procédure de rotation

### Calendrier

| Secret | Fréquence | Responsable | Dernière rotation |
|--------|-----------|-------------|-------------------|
| JWT_SECRET | 90 jours | DevOps | 2026-01-15 |
| DATABASE_PASSWORD | 90 jours | DBA | 2026-01-15 |
| OPENAI_API_KEY | 180 jours | Backend Lead | 2025-12-01 |
| ANTHROPIC_API_KEY | 180 jours | Backend Lead | 2025-12-01 |
| QDRANT_API_KEY | 180 jours | DevOps | 2025-12-01 |

### Procédure

1. Générer le nouveau secret (32+ caractères aléatoires pour les mots de passe)
2. Mettre à jour dans Vault/SSM
3. Déployer la nouvelle configuration (rolling restart)
4. Vérifier que les services fonctionnent avec le nouveau secret
5. Révoquer l'ancien secret après confirmation
6. Mettre à jour le calendrier de rotation

## Détection des secrets dans le code

### Pre-commit hook

Un hook pre-commit bloque les commits contenant des secrets :

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

### CI/CD Scanning

Le pipeline CI exécute un scan de secrets à chaque PR :
- **detect-secrets** : Détection de patterns (API keys, passwords)
- **truffleHog** : Recherche dans l'historique Git
- **GitHub Advanced Security** : Secret scanning natif

## Incident : Secret compromis

1. **Révoquer immédiatement** : Invalider le secret compromis
2. **Notifier** : Slack #security-incidents + email security@modularmind.io
3. **Audit** : Vérifier les logs d'accès pour la période d'exposition
4. **Remédier** : Générer et déployer un nouveau secret
5. **Documenter** : Créer un rapport d'incident dans le registre
6. **Améliorer** : Identifier comment la compromission a eu lieu et corriger