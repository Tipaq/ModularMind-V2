# Procédure de déploiement — Environnement Staging

## Prérequis

- Accès SSH au serveur staging (`staging.modularmind.internal`)
- Droits de push sur la branche `develop`
- VPN actif pour accéder à l'infrastructure interne

## Checklist pré-déploiement

- [ ] Tous les tests unitaires passent (CI vert sur la branche)
- [ ] Les migrations Alembic ont été testées localement
- [ ] Les variables d'environnement ont été vérifiées dans `.env.staging`
- [ ] Pas de secrets hardcodés dans le code
- [ ] Les changements de schéma DB ont été revus par un DBA
- [ ] Le changelog a été mis à jour

## Procédure

### 1. Préparer la release

```bash
# Depuis la branche develop
git checkout develop
git pull origin develop

# Vérifier les changements depuis le dernier déploiement
git log --oneline staging..develop
```

### 2. Lancer le déploiement

```bash
# Le déploiement staging est automatisé via GitHub Actions
# Un push sur develop déclenche le workflow staging
git push origin develop
```

Le workflow CI/CD effectue :
1. Build des images Docker (Engine, Worker, SPAs)
2. Push vers le registry interne (ghcr.io/modularmind)
3. Pull et redémarrage sur le serveur staging via SSH
4. Exécution des migrations Alembic
5. Smoke tests automatiques

### 3. Vérifications post-déploiement

```bash
# Santé de l'API
curl https://staging-api.modularmind.internal/health

# Vérifier les versions
curl https://staging-api.modularmind.internal/version
# Attendu: {"version": "3.2.0-rc.1", "commit": "abc1234"}

# Vérifier les logs
ssh staging 'docker logs modularmind-engine --tail 50 --since 5m'
ssh staging 'docker logs modularmind-worker --tail 50 --since 5m'
```

### 4. Smoke tests manuels

1. Ouvrir https://staging-chat.modularmind.internal
2. Se connecter avec le compte de test (`test@modularmind.io` / `testpass123`)
3. Créer une nouvelle conversation avec l'agent par défaut
4. Envoyer un message et vérifier le streaming SSE
5. Uploader un document dans la base de connaissances
6. Vérifier le monitoring dans la console Ops

## Rollback

En cas de problème :

```bash
# Revenir à la version précédente
ssh staging 'cd /opt/modularmind && docker compose pull --policy=missing && docker compose up -d'
# Ou forcer une version spécifique
ssh staging 'cd /opt/modularmind && IMAGE_TAG=v3.1.0 docker compose up -d'
```

Pour un rollback de migration :
```bash
ssh staging 'cd /opt/modularmind && docker exec modularmind-engine alembic downgrade -1'
```

## Contacts

- **Responsable staging** : Équipe DevOps (#devops sur Slack)
- **En cas d'urgence** : Appeler le DevOps on-call via PagerDuty