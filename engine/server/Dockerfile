FROM python:3.12-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install shared package first
COPY shared/ /tmp/shared/
RUN pip install --no-cache-dir /tmp/shared/ && rm -rf /tmp/shared/

# Install engine dependencies
COPY engine/server/pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]" 2>/dev/null || pip install --no-cache-dir .

# Copy engine source
COPY engine/server/ .

EXPOSE 8000

# Default: run engine server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
