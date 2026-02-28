# =============================================================================
# Engine Dockerfile — multi-stage build (shared + engine)
# =============================================================================
# Used by both `engine` and `worker` services (same image, different CMD)

FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# --- Dependencies stage ---
FROM base AS deps

# Install shared package first (rarely changes)
COPY shared/pyproject.toml /tmp/shared/pyproject.toml
COPY shared/src /tmp/shared/src
RUN pip install --no-cache-dir /tmp/shared/ && rm -rf /tmp/shared/

# Install engine dependencies (no dev deps in production)
COPY engine/server/pyproject.toml /tmp/engine/pyproject.toml
RUN cd /tmp/engine && pip install --no-cache-dir . && rm -rf /tmp/engine/

# --- Runtime stage ---
FROM base AS runtime

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy engine source + Alembic
COPY engine/server/src ./src
COPY engine/server/seed ./seed
COPY engine/server/alembic.ini ./alembic.ini
COPY engine/server/alembic ./alembic

EXPOSE 8000

# Default: run engine server (worker overrides via docker-compose command)
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
