# Runbook — Migration Production vers Kubernetes

## Prérequis

Avant de démarrer la migration, vérifier :

- [ ] Cluster K8s production opérationnel et testé
- [ ] Helm charts validés sur staging
- [ ] Backup PostgreSQL < 24h vérifié et restaurable
- [ ] Snapshot Qdrant < 24h vérifié et restaurable
- [ ] TTL DNS réduit à 60s depuis au moins 7 jours
- [ ] Communication envoyée aux clients enterprise (J-7)
- [ ] Freeze déploiements activé (J-1)
- [ ] War room configuré (Slack channel + PagerDuty escalation)

## Participants

| Rôle | Nom | Contact |
|------|-----|---------|
| Migration Lead | Julien Morel | @julien (Slack) |
| DBA | Aisha Benali | @aisha (Slack) |
| SRE | Maxime Faure | @maxime (Slack) |
| Backend (validation) | Nicolas Durand | @nicolas (Slack) |
| Décisionnaire rollback | David Chen (CTO) | @david (Slack) |

## Timeline Détaillée

### H-2:00 — Préparation (22h00)

```bash
# 1. Vérifier l'état du cluster K8s
kubectl get nodes -o wide
kubectl get pods -n mm-production
kubectl get pods -n mm-infra

# 2. Vérifier les backups
kubectl exec -n mm-infra mm-postgres-1 -- pg_isready
aws s3 ls s3://mm-backups/postgres/ --recursive | tail -5

# 3. Activer le mode maintenance sur les VMs
curl -X POST https://api.modularmind.io/admin/maintenance \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": true, "message": "Maintenance planifiée — retour sous 30 minutes"}'

# 4. Attendre que les connexions actives se drainent (max 5 min)
watch 'curl -s https://api.modularmind.io/health | jq .active_connections'
```

### H-1:30 — Migration PostgreSQL (22h30)

```bash
# 1. Dump depuis les VMs (format custom, compressé)
ssh vm-db "pg_dump -U modularmind -Fc -Z6 modularmind > /tmp/mm_prod_dump.sql"

# 2. Copier le dump vers le pod PostgreSQL K8s
scp vm-db:/tmp/mm_prod_dump.sql /tmp/
kubectl cp /tmp/mm_prod_dump.sql mm-infra/mm-postgres-1:/tmp/

# 3. Restaurer sur CloudNativePG
kubectl exec -n mm-infra mm-postgres-1 -- \
  pg_restore -U modularmind -d modularmind --clean --if-exists /tmp/mm_prod_dump.sql

# 4. Vérifier l'intégrité
kubectl exec -n mm-infra mm-postgres-1 -- psql -U modularmind -c "
  SELECT 'users' as table_name, count(*) FROM users
  UNION ALL SELECT 'conversations', count(*) FROM conversations
  UNION ALL SELECT 'rag_collections', count(*) FROM rag_collections
  UNION ALL SELECT 'rag_documents', count(*) FROM rag_documents
  UNION ALL SELECT 'memory_entries', count(*) FROM memory_entries;
"

# 5. Comparer avec les comptes de la VM
ssh vm-db "psql -U modularmind -c \"SELECT 'users', count(*) FROM users;\""
```

**CHECKPOINT** : les comptes doivent correspondre à ±0. Si écart, **STOP** et investiguer.

### H-0:45 — Migration Qdrant (23h15)

```bash
# 1. Créer un snapshot sur la VM Qdrant
curl -X POST http://vm-qdrant:6333/collections/mm_documents/snapshots

# 2. Télécharger le snapshot
SNAPSHOT_NAME=$(curl -s http://vm-qdrant:6333/collections/mm_documents/snapshots | jq -r '.result[-1].name')
curl -o /tmp/qdrant_snapshot.tar http://vm-qdrant:6333/collections/mm_documents/snapshots/$SNAPSHOT_NAME

# 3. Copier vers le pod Qdrant K8s
kubectl cp /tmp/qdrant_snapshot.tar mm-infra/qdrant-0:/tmp/

# 4. Restaurer
kubectl exec -n mm-infra qdrant-0 -- \
  curl -X POST localhost:6333/collections/mm_documents/snapshots/upload \
  -H "Content-Type: multipart/form-data" \
  -F "snapshot=@/tmp/qdrant_snapshot.tar"

# 5. Vérifier le nombre de vecteurs
kubectl exec -n mm-infra qdrant-0 -- \
  curl -s localhost:6333/collections/mm_documents | jq '.result.points_count'
```

### H-0:15 — Smoke Tests (23h45)

```bash
# Exécuter la suite de smoke tests contre le cluster K8s
# (via le service interne, avant la bascule DNS)

ENGINE_K8S_URL="http://engine.mm-production.svc.cluster.local:8000"

# Test 1: Health check
kubectl exec -n mm-production deploy/engine -- curl -s localhost:8000/health

# Test 2: Auth + API
kubectl run smoke-test --rm -it --image=curlimages/curl --restart=Never -- \
  curl -s "$ENGINE_K8S_URL/auth/login" \
  -d '{"email":"smoke@test.com","password":"smoke_test_pwd"}' \
  -H "Content-Type: application/json"

# Test 3: RAG search
kubectl run smoke-test-2 --rm -it --image=curlimages/curl --restart=Never -- \
  curl -s "$ENGINE_K8S_URL/rag/search" \
  -d '{"query":"test search","limit":5}' \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE"
```

**CHECKPOINT** : tous les smoke tests doivent passer. Si échec, **STOP** et investiguer.

### H-0:00 — Bascule DNS (00h00)

```bash
# 1. Mettre à jour les records DNS (OVH API)
ovh-cli dns update api.modularmind.io A $K8S_INGRESS_IP
ovh-cli dns update app.modularmind.io A $K8S_INGRESS_IP

# 2. Vérifier la propagation DNS
watch 'dig +short api.modularmind.io'

# 3. Tester via l'URL publique
curl -s https://api.modularmind.io/health
curl -s https://app.modularmind.io/ | head -5
```

### H+1:00 — Validation (01h00)

```bash
# Monitoring intensif pendant 1 heure
# Dashboard Grafana : https://grafana.mm-monitoring.svc/d/mm-production

# Vérifier :
# - Error rate < 0.1%
# - Latence P99 < 300ms
# - Tous les pods healthy
# - Pas d'alertes PagerDuty

kubectl top pods -n mm-production
kubectl get events -n mm-production --sort-by='.lastTimestamp' | tail -20
```

### H+2:00 — Fin de Maintenance (02h00)

```bash
# Désactiver le mode maintenance
curl -X POST https://api.modularmind.io/admin/maintenance \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": false}'

# Notification Slack
curl -X POST $SLACK_WEBHOOK -d '{"text":"✅ Migration K8s terminée avec succès. Tous les services opérationnels."}'
```

## Procédure de Rollback

Si un critère de rollback est atteint :

```bash
# 1. Rebascule DNS vers les VMs
ovh-cli dns update api.modularmind.io A $VM_IP
ovh-cli dns update app.modularmind.io A $VM_IP

# 2. Redémarrer les services sur les VMs
ssh vm-engine "cd /opt/modularmind && docker compose up -d"

# 3. Vérifier le fonctionnement
curl -s https://api.modularmind.io/health

# 4. Notification
curl -X POST $SLACK_WEBHOOK -d '{"text":"⚠️ Rollback migration K8s effectué. Services restaurés sur VMs."}'
```

**Important :** les VMs sont maintenues en standby pendant 14 jours post-migration. La base de données VM ne reçoit plus de writes après la bascule — en cas de rollback, les données créées sur K8s seront perdues.

## Post-Migration Checklist

- [ ] Monitoring 24/7 pendant 48h (rotation SRE)
- [ ] Validation SLA 99.9% sur 7 jours
- [ ] Backup automatique CloudNativePG vérifié
- [ ] Tests de disaster recovery (kill un nœud, vérifier auto-healing)
- [ ] Communication succès aux clients enterprise
- [ ] Décommissionnement VMs (J+14)
- [ ] Mise à jour documentation opérationnelle
- [ ] Rétrospective migration (J+7)
