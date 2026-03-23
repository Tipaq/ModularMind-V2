# Guide CI/CD — GitHub Actions Pipeline

## Overview

ModularMind uses GitHub Actions for continuous integration and deployment. The pipeline handles linting, testing, building, and deploying across all applications.

## Workflow Files

```
.github/workflows/
├── ci.yml              # PR checks (lint, test, type-check)
├── staging.yml         # Auto-deploy to staging on develop push
├── production.yml      # Manual deploy to production (with approval)
├── docker-build.yml    # Build and push Docker images
└── dependency-review.yml  # Automated dependency security review
```

## CI Pipeline (ci.yml)

Triggered on every pull request to `main` and `develop`.

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]

jobs:
  lint-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install ruff
      - run: ruff check engine/server/src/
      - run: ruff format --check engine/server/src/

  lint-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint

  test-python:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: test_modularmind
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
      - run: pip install -e "engine/server[test]"
      - run: pytest engine/server/tests/ -v --cov=src --cov-report=xml

  test-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo test

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo type-check

  build:
    needs: [lint-python, lint-typescript, test-python, test-typescript, type-check]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
```

## Docker Image Build

```yaml
name: Docker Build
on:
  push:
    tags: ["v*"]

jobs:
  build-engine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.engine
          push: true
          tags: ghcr.io/modularmind/engine:${{ github.ref_name }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## Secrets Management

| Secret | Usage | Rotation |
|--------|-------|----------|
| `GITHUB_TOKEN` | Package registry, PR status | Auto (GitHub) |
| `STAGING_SSH_KEY` | SSH to staging server | 90 days |
| `PRODUCTION_KUBECONFIG` | Kubectl access | 90 days |
| `DOCKER_REGISTRY_TOKEN` | Push Docker images | 180 days |
| `CODECOV_TOKEN` | Upload coverage reports | Never |

## Artifact Caching

- **pnpm store**: Cached between runs, key based on `pnpm-lock.yaml` hash
- **pip packages**: Cached via `actions/setup-python` cache option
- **Docker layers**: Cached via GitHub Actions cache backend (`cache-from: type=gha`)
- **Turborepo**: Remote cache via Vercel (configured in `turbo.json`)

## Branch Protection Rules

| Branch | Required Checks | Reviews | Merge Strategy |
|--------|----------------|---------|----------------|
| `main` | All CI + staging validation | 2 approvals | Squash merge |
| `develop` | All CI | 1 approval | Squash merge |