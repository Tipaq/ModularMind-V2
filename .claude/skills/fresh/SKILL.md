---
name: fresh
description: Reset and rebuild the development environment from scratch
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash
---

Reset and rebuild the full dev environment. Use when things are broken or after major changes.

## Steps

1. **Confirm with the user** — this is destructive, list what will happen:
   - Stop all Docker containers
   - Rebuild images
   - Restart infrastructure
   - Apply migrations
   - Verify health

2. **Stop everything**:
   ```bash
   docker compose -f docker/docker-compose.dev.yml down
   ```

3. **Rebuild containers**:
   ```bash
   docker compose -f docker/docker-compose.dev.yml build --no-cache
   ```

4. **Start infrastructure**:
   ```bash
   docker compose -f docker/docker-compose.dev.yml up -d db redis qdrant
   ```

5. **Wait for DB readiness** (max 30s):
   ```bash
   for i in $(seq 1 15); do docker exec docker-db-1 pg_isready -U modularmind 2>/dev/null && break; sleep 2; done
   ```

6. **Start services**:
   ```bash
   docker compose -f docker/docker-compose.dev.yml up -d engine worker gateway
   ```

7. **Apply migrations**:
   ```bash
   cd engine/server && alembic upgrade head
   ```

8. **Verify health** — run the `/health` skill logic to confirm everything is up

9. Report final status to the user

## Rules
- ALWAYS ask for confirmation before starting
- Never run `docker system prune` without explicit user request
- Never delete database volumes unless user explicitly asks for a full wipe
- If `$ARGUMENTS` contains "wipe", warn that this will DELETE ALL DATA
