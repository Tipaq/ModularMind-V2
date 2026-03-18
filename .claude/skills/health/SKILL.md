---
name: health
description: Check the health of all ModularMind services
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash
---

Check the health status of all ModularMind services and infrastructure.

## Steps

1. **Docker containers** — check running state:
   ```bash
   docker compose -f docker/docker-compose.dev.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Dev stack not running"
   ```

2. **Service endpoints** — test health in parallel:
   - Engine: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health`
   - Gateway: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8200/health`
   - Worker: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/health`
   - Platform: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`

3. **Infrastructure** — test connectivity:
   - PostgreSQL: `docker exec docker-db-1 pg_isready -U modularmind 2>/dev/null`
   - Redis: `docker exec docker-redis-1 redis-cli ping 2>/dev/null`
   - Qdrant: `curl -s http://localhost:6333/readyz 2>/dev/null`
   - MinIO: `curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/minio/health/live 2>/dev/null`
   - Ollama: `curl -s http://localhost:11434/api/tags 2>/dev/null | head -1`

4. **Present as a status table**:

| Service | Status | Details |
|---------|--------|---------|
| Engine | UP/DOWN | HTTP code or error |
| ... | ... | ... |

5. If any service is down, suggest the fix command (e.g., `make dev-infra`, `docker compose restart engine`)
