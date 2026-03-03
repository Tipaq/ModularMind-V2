# Runbook — PostgreSQL Database Incident

## Severity Classification

| Severity | Symptoms | Response Time |
|----------|----------|---------------|
| P1 - Critical | Database unreachable, all queries failing | Immediate (< 5 min) |
| P2 - Major | Replication lag > 30s, connection pool exhausted | < 15 min |
| P3 - Minor | Slow queries > 5s, high CPU usage | < 1 hour |

## Diagnostic Commands

### Check Connection Count
```bash
# Current connections vs max
docker exec modularmind-db psql -U modularmind -c "SELECT count(*) as current, (SELECT setting FROM pg_settings WHERE name='max_connections') as max FROM pg_stat_activity;"

# Connections by state
docker exec modularmind-db psql -U modularmind -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"

# Connections by application
docker exec modularmind-db psql -U modularmind -c "SELECT application_name, count(*) FROM pg_stat_activity GROUP BY application_name ORDER BY count DESC;"
```

### Check Long-Running Queries
```bash
# Queries running longer than 30 seconds
docker exec modularmind-db psql -U modularmind -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
AND state != 'idle'
ORDER BY duration DESC;"
```

### Check Disk Usage
```bash
# Database size
docker exec modularmind-db psql -U modularmind -c "SELECT pg_database_size('modularmind') / 1024 / 1024 as size_mb;"

# Table sizes
docker exec modularmind-db psql -U modularmind -c "
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"
```

### Check Replication Lag
```bash
docker exec modularmind-db psql -U modularmind -c "SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn FROM pg_stat_replication;"
```

## Resolution Procedures

### Connection Pool Exhaustion (P1)

**Root Cause:** Engine or Worker holding too many connections.

1. Identify the source: check connections by application name
2. Kill idle-in-transaction connections older than 5 minutes:
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
AND query_start < now() - interval '5 minutes';
```
3. Restart the Engine service: `docker restart modularmind-engine`
4. Verify connections return to normal levels
5. Check `DATABASE_POOL_SIZE` and `DATABASE_MAX_OVERFLOW` in `.env`

### Slow Query Performance (P3)

1. Identify slow queries from `pg_stat_statements`
2. Run `EXPLAIN ANALYZE` on the problematic query
3. Check for missing indexes: `SELECT * FROM pg_stat_user_tables WHERE seq_scan > idx_scan AND n_live_tup > 10000;`
4. If vacuum is needed: `VACUUM ANALYZE tablename;`
5. Consider adding an index if sequential scans dominate

### Disk Full (P1)

1. Check WAL accumulation: `SELECT count(*) FROM pg_ls_waldir();`
2. Check for bloated tables: run `pg_repack` if available
3. Clear old WAL files if replication is caught up
4. Increase disk allocation if this is a recurring issue
5. Review retention policies for conversation messages and logs

## Escalation

If unable to resolve within 30 minutes for P1/P2, escalate to:
1. **Primary DBA**: Thomas Lefevre (thomas@modularmind.io)
2. **VP Engineering**: Marie Chen (marie@modularmind.io)
3. **External DBA consultancy**: pgExperts (contract #MM-2025-042)

## Post-Incident

- File a post-mortem within 48 hours
- Update monitoring alerts if gaps identified
- Review connection pool settings quarterly