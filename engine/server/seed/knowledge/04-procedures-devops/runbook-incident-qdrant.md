# Runbook — Qdrant Vector Store Incident

## Severity Classification

| Severity | Symptoms | Response Time |
|----------|----------|---------------|
| P1 - Critical | Qdrant unreachable, all RAG/memory search fails | Immediate |
| P2 - Major | Search latency > 500ms, collection corruption | < 15 min |
| P3 - Minor | High memory usage, slow indexing | < 1 hour |

## Diagnostic Commands

### Health Check
```bash
curl http://localhost:6333/healthz
curl http://localhost:6333/telemetry
```

### Collection Status
```bash
# List collections
curl http://localhost:6333/collections

# Collection details
curl http://localhost:6333/collections/knowledge
curl http://localhost:6333/collections/memory

# Check point count and index status
curl http://localhost:6333/collections/knowledge | jq '.result.points_count, .result.indexed_vectors_count'
```

### Cluster Info
```bash
curl http://localhost:6333/cluster
```

## Resolution Procedures

### Collection Index Corruption (P2)

**Symptoms:** Search returns empty results or inconsistent scores despite known matching documents.

1. Verify collection health:
```bash
curl http://localhost:6333/collections/knowledge | jq '.result.status'
# Expected: "green"
```
2. If status is "yellow" or "red", trigger reindexing:
```bash
curl -X PATCH http://localhost:6333/collections/knowledge   -H "Content-Type: application/json"   -d '{"optimizers_config": {"indexing_threshold": 100}}'
```
3. Wait for reindexing to complete (monitor via telemetry)
4. If reindexing fails, rebuild from PostgreSQL:
   - Export chunk data from `rag_chunks` table
   - Delete and recreate the Qdrant collection
   - Re-embed and upsert all chunks

### High Memory Usage (P3)

1. Check memory consumption:
```bash
curl http://localhost:6333/telemetry | jq '.result.memory'
```
2. If on-disk storage is not enabled, migrate:
```bash
curl -X PATCH http://localhost:6333/collections/knowledge   -H "Content-Type: application/json"   -d '{"vectors": {"dense": {"on_disk": true}}}'
```
3. Move payloads to disk:
```bash
curl -X PATCH http://localhost:6333/collections/knowledge   -H "Content-Type: application/json"   -d '{"optimizers_config": {"memmap_threshold": 10000}}'
```

### Qdrant Unreachable (P1)

1. Check Docker container: `docker ps | grep qdrant`
2. Check logs: `docker logs modularmind-qdrant --tail 100`
3. Check disk space (Qdrant storage can grow rapidly with large collections)
4. Restart Qdrant: `docker restart modularmind-qdrant`
5. Verify collections are intact after restart
6. If data lost, restore from latest snapshot:
```bash
curl -X PUT http://localhost:6333/collections/knowledge/snapshots/recover   -H "Content-Type: application/json"   -d '{"location": "/qdrant/snapshots/knowledge/snapshot_2026-03-01.snapshot"}'
```

## Snapshot Management

### Create Snapshot
```bash
curl -X POST http://localhost:6333/collections/knowledge/snapshots
```

### Schedule Automated Snapshots
Snapshots are created daily at 02:00 UTC via the APScheduler job in the Worker process.

## Escalation
- P1: DevOps on-call + Backend lead
- P2: DevOps team via Slack #qdrant-incidents
- P3: Jira ticket, next sprint