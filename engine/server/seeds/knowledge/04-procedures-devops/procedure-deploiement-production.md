# Procédure de déploiement — Production (Kubernetes)

## Avertissement

Le déploiement en production est une opération critique. Suivez cette procédure rigoureusement. Tout déploiement doit être validé par au moins un membre senior de l'équipe.

## Prérequis

- [ ] Changements validés en staging depuis au moins 48h
- [ ] Approbation du Tech Lead ou VP Engineering
- [ ] Fenêtre de maintenance communiquée aux clients (si breaking changes)
- [ ] Plan de rollback documenté et testé
- [ ] Dashboard Grafana ouvert pour le monitoring en temps réel

## Stratégie de déploiement : Canary

Nous utilisons un déploiement canary en 3 phases :

### Phase 1 : Canary (10% du trafic)

```bash
# Mettre à jour l'image dans le manifest canary
kubectl set image deployment/engine-canary engine=ghcr.io/modularmind/engine:v3.2.0 -n production

# Vérifier le déploiement
kubectl rollout status deployment/engine-canary -n production
```

**Monitoring (15 minutes)** :
- Taux d'erreur du canary < 0.1%
- Latence P95 < 500ms
- Pas de crash loops dans les pods

### Phase 2 : Rolling update (100% progressif)

```bash
# Si le canary est sain, déployer sur le main deployment
kubectl set image deployment/engine engine=ghcr.io/modularmind/engine:v3.2.0 -n production

# Suivre le rollout
kubectl rollout status deployment/engine -n production
```

Configuration du rolling update :
```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

### Phase 3 : Worker

```bash
# Déployer le worker (un seul réplica, drainer d'abord)
kubectl scale deployment/worker --replicas=0 -n production
# Attendre que les tâches en cours se terminent (max 60s graceful shutdown)
kubectl set image deployment/worker worker=ghcr.io/modularmind/worker:v3.2.0 -n production
kubectl scale deployment/worker --replicas=1 -n production
```

## Migrations de base de données

Les migrations sont exécutées AVANT le déploiement des nouvelles images :

```bash
# Lancer la migration via un Job Kubernetes
kubectl apply -f k8s/jobs/migrate-v3.2.0.yaml -n production

# Suivre le job
kubectl logs -f job/migrate-v3.2.0 -n production
```

**Règle importante** : Les migrations doivent être rétrocompatibles. Le nouveau schéma doit fonctionner avec l'ancien code ET le nouveau code.

## Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 15
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2
```

## Rollback immédiat

```bash
# Rollback du deployment Engine
kubectl rollout undo deployment/engine -n production

# Vérifier le rollback
kubectl rollout status deployment/engine -n production

# Si migration à annuler (ATTENTION: tester d'abord en staging)
kubectl apply -f k8s/jobs/rollback-migration.yaml -n production
```

## Post-déploiement

1. Vérifier les dashboards Grafana pendant 1 heure
2. Tester manuellement les fonctionnalités critiques
3. Communiquer le succès du déploiement sur #releases
4. Mettre à jour le changelog public
5. Fermer les tickets Jira associés

## Contacts et escalade

| Rôle | Contact | Moyen |
|------|---------|-------|
| DevOps on-call | Rotation hebdomadaire | PagerDuty |
| Tech Lead | Alexandre Martin | Slack DM / Téléphone |
| VP Engineering | Marie Chen | Téléphone (urgences) |
| DBA | Thomas Lefevre | Slack #dba |