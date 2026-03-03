# =============================================================================
# ModularMind V2 — Development Commands
# =============================================================================

.PHONY: help setup dev dev-chat dev-ops dev-platform dev-engine dev-worker dev-infra dev-monitoring stop-monitoring build build-docker build-platform build-mcp-sidecars deploy deploy-platform test test-cov lint lint-fix migrate migrate-new db-push db-studio clean

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Setup ---

setup: ## Initial project setup
	pnpm install
	cd shared && pip install -e ".[dev]"
	cd engine/server && pip install -e ".[dev]"
	cp -n .env.example .env 2>/dev/null || true
	@echo "Setup complete!"

# --- Development ---

dev: ## Start all services (Docker)
	docker compose -f docker/docker-compose.dev.yml up --build

dev-chat: ## Start Chat app (Vite dev server)
	pnpm dev:chat

dev-ops: ## Start Ops Console (Vite dev server)
	pnpm dev:ops

dev-platform: ## Start Platform (Next.js dev server)
	pnpm dev:platform

dev-engine: ## Start Engine server (uvicorn)
	cd engine/server && uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

dev-worker: ## Start Worker process (auto-reload)
	cd engine/server && watchfiles "python -m src.worker.runner" src/

dev-infra: ## Start infra only (db, redis, qdrant, ollama)
	docker compose -f docker/docker-compose.dev.yml up db redis qdrant ollama

dev-monitoring: ## Start monitoring (Prometheus + Grafana + exporters)
	docker compose -f docker/docker-compose.monitoring.yml up -d
	@echo "Grafana:    http://localhost:3333  (admin / modularmind)"
	@echo "Prometheus: http://localhost:9090"

stop-monitoring: ## Stop monitoring stack
	docker compose -f docker/docker-compose.monitoring.yml down

# --- Build ---

build: ## Build all apps
	pnpm build

build-docker: ## Build Docker images (client deployment)
	docker compose -f docker/docker-compose.yml build

build-platform: ## Build Platform Docker image
	docker compose -f docker/docker-compose.platform.yml build

build-mcp-sidecars: ## Build MCP sidecar Docker images
	docker build -t modularmind/mcp-node-proxy:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.node-proxy engine/mcp-sidecars/mcp-sidecars/
	docker build -t modularmind/mcp-brave-search:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.brave-search engine/mcp-sidecars/mcp-sidecars/
	docker build -t modularmind/mcp-duckduckgo:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.duckduckgo engine/mcp-sidecars/mcp-sidecars/
	docker build -t modularmind/mcp-qdrant:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.qdrant engine/mcp-sidecars/mcp-sidecars/
	docker build -t modularmind/mcp-motherduck:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.motherduck engine/mcp-sidecars/mcp-sidecars/
	docker build -t modularmind/mcp-puppeteer:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.puppeteer engine/mcp-sidecars/mcp-sidecars/
	docker build -t modularmind/mcp-whatsapp:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.whatsapp engine/mcp-sidecars/mcp-sidecars/

deploy: ## Deploy client stack
	docker compose -f docker/docker-compose.yml up -d

deploy-platform: ## Deploy platform stack
	docker compose -f docker/docker-compose.platform.yml up -d

# --- Test ---

test: ## Run all tests
	cd shared && pytest
	cd engine/server && pytest

test-cov: ## Run tests with coverage
	cd engine/server && pytest --cov=src --cov-report=html

# --- Lint ---

lint: ## Run linters
	pnpm lint
	cd shared && ruff check .
	cd engine/server && ruff check .

lint-fix: ## Fix lint issues
	cd shared && ruff check --fix .
	cd engine/server && ruff check --fix .

# --- Database ---

migrate: ## Run Engine DB migrations
	cd engine/server && alembic upgrade head

migrate-new: ## Create new Engine migration
	@read -p "Migration message: " msg; cd engine/server && alembic revision --autogenerate -m "$$msg"

db-push: ## Push Platform Prisma schema to DB
	cd platform && npx prisma db push

db-studio: ## Open Platform Prisma Studio
	cd platform && npx prisma studio

# --- Clean ---

clean: ## Clean build artifacts
	rm -rf node_modules .turbo
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
