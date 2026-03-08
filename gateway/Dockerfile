# =============================================================================
# Gateway Dockerfile — secure system access service
# =============================================================================

FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- Dependencies stage ---
FROM base AS deps

COPY gateway/pyproject.toml /tmp/gateway/pyproject.toml
# Create minimal src/ so hatchling can discover the package
RUN mkdir -p /tmp/gateway/src && touch /tmp/gateway/src/__init__.py \
    && cd /tmp/gateway && pip install --no-cache-dir . && rm -rf /tmp/gateway/

# --- Runtime stage ---
FROM base AS runtime

COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

COPY gateway/src ./src

EXPOSE 8200

# CRITICAL: single worker to maintain sandbox state consistency
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8200", "--workers", "1"]
