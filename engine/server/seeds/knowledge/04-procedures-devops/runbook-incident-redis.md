# Runbook — Redis Incident

## Severity Classification

| Severity | Symptoms | Response Time |
|----------|----------|---------------|
| P1 - Critical | Redis unreachable, all caching/streaming fails | Immediate |
| P2 - Major | Memory usage > 90%, eviction occurring | < 15 min |
| P3 - Minor | Stream lag > 1000 messages, slow operations | < 1 hour |

## Diagnostic Commands

### Memory Status
```bash
docker exec modularmind-redis redis-cli INFO memory
# Key metrics: used_memory_human, used_memory_peak_human, mem_fragmentation_ratio
```

### Stream Information
```bash
# Check stream lengths
docker exec modularmind-redis redis-cli XLEN tasks:documents
docker exec modularmind-redis redis-cli XLEN tasks:models
docker exec modularmind-redis redis-cli XLEN memory:raw
docker exec modularmind-redis redis-cli XLEN memory:extracted

# Check consumer group lag
docker exec modularmind-redis redis-cli XINFO GROUPS tasks:documents
```

### Connection Count
```bash
docker exec modularmind-redis redis-cli CLIENT LIST | wc -l
docker exec modularmind-redis redis-cli INFO clients
```

### Slow Log
```bash
docker exec modularmind-redis redis-cli SLOWLOG GET 10
```

## Resolution Procedures

### Memory Pressure (P2)

1. Check which keys consume the most memory:
```bash
docker exec modularmind-redis redis-cli --bigkeys
```
2. If cache keys dominate, flush the cache namespace:
```bash
docker exec modularmind-redis redis-cli EVAL "for _,k in ipairs(redis.call('keys','cache:*')) do redis.call('del',k) end" 0
```
3. If streams are growing unbounded, trim them:
```bash
docker exec modularmind-redis redis-cli XTRIM tasks:documents MAXLEN ~ 10000
```
4. Review `maxmemory-policy` (should be `allkeys-lru` for cache, `noeviction` for streams)

### Consumer Group Lag (P3)

1. Check if the Worker process is running: `docker ps | grep worker`
2. Check Worker logs: `docker logs modularmind-worker --tail 100`
3. If Worker is stuck, restart it: `docker restart modularmind-worker`
4. If lag is due to slow processing, consider scaling Workers (run multiple instances with the same consumer group)
5. Monitor pending entries list (PEL):
```bash
docker exec modularmind-redis redis-cli XPENDING tasks:documents doc_processors - + 10
```

### Redis Unreachable (P1)

1. Check if container is running: `docker ps | grep redis`
2. Check container logs: `docker logs modularmind-redis --tail 50`
3. Check disk space on host (Redis RDB/AOF persistence can fill disk)
4. Restart Redis: `docker restart modularmind-redis`
5. Verify data integrity after restart
6. If data is corrupted, restore from latest RDB snapshot

## Escalation

- P1: Notify DevOps on-call immediately via PagerDuty
- P2: Slack #devops-alerts within 15 minutes
- P3: Create Jira ticket, assign to DevOps team