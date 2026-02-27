# =============================================================================
# ModularMind V2 — Development Commands
# =============================================================================

.PHONY: help setup dev dev-chat dev-ops dev-platform dev-engine build test lint clean

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

# --- Build ---

build: ## Build all apps
	pnpm build

build-docker: ## Build Docker images
	docker compose -f docker/docker-compose.yml build

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

# --- Clean ---

clean: ## Clean build artifacts
	rm -rf node_modules .turbo
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
