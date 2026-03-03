# Setup environnement de développement — ModularMind

## Outils requis

Avant de commencer, installez les outils suivants sur votre machine :

| Outil | Version | Installation |
|-------|---------|-------------|
| Python | 3.12+ | `pyenv install 3.12` ou téléchargement direct |
| Node.js | 20 LTS | `nvm install 20` ou téléchargement direct |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| Docker | 24+ | Docker Desktop (Mac/Windows) ou docker-ce (Linux) |
| Docker Compose | 2.20+ | Inclus dans Docker Desktop |
| Git | 2.40+ | Inclus dans la plupart des OS |

### IDE recommandé : VSCode

Extensions à installer :
- **Python** (ms-python.python) — IntelliSense, debugging, linting
- **Ruff** (charliermarsh.ruff) — Linter/formatter Python
- **Pylance** (ms-python.vscode-pylance) — Type checking avancé
- **ESLint** (dbaeumer.vscode-eslint) — Linter TypeScript
- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss) — Autocomplétion Tailwind
- **Prettier** (esbenp.prettier-vscode) — Formatter TypeScript/JSON
- **GitLens** (eamodio.gitlens) — Git histoire et annotations
- **Thunder Client** (rangav.vscode-thunder-client) — Client API REST

## Cloner le dépôt

```bash
git clone https://github.com/modularmind/modularmind-v2.git
cd modularmind-v2
```

## Installation des dépendances

### Backend (Python)

```bash
cd engine/server
python -m venv .venv
source .venv/bin/activate  # ou .venv\Scripts\activate sur Windows
pip install -e ".[dev]"
```

### Frontend (TypeScript)

```bash
# Depuis la racine du projet
pnpm install
```

Cela installe les dépendances de tous les packages du monorepo (apps/chat, apps/ops, packages/ui, packages/api-client).

## Configuration

### Variables d'environnement

```bash
cp engine/server/.env.example engine/server/.env
```

Éditez le fichier `.env` avec vos valeurs locales. Les valeurs par défaut fonctionnent pour le développement avec Docker Compose.

### Démarrer l'infrastructure

```bash
make dev-infra
```

Cela lance PostgreSQL, Redis, Qdrant et Ollama via Docker Compose. Vérifiez que tout est en état healthy :

```bash
docker compose -f docker/docker-compose.dev.yml ps
```

### Télécharger un modèle LLM

```bash
docker exec modularmind-ollama ollama pull llama3.1:8b
docker exec modularmind-ollama ollama pull nomic-embed-text
```

### Exécuter les migrations

```bash
cd engine/server
alembic upgrade head
```

## Lancer les services

Ouvrez 4 terminaux :

```bash
# Terminal 1 — Engine API
make dev-engine    # http://localhost:8000

# Terminal 2 — Worker
make dev-worker

# Terminal 3 — Chat SPA
make dev-chat      # http://localhost:5173

# Terminal 4 — Ops SPA
make dev-ops       # http://localhost:5174
```

## Vérification

1. Ouvrez http://localhost:8000/docs pour voir la documentation Swagger de l'API
2. Ouvrez http://localhost:5173 pour l'interface Chat
3. Ouvrez http://localhost:5174 pour la console Ops
4. Connectez-vous avec : `admin@modularmind.io` / `changeme`

## Troubleshooting setup

| Problème | Solution |
|----------|----------|
| `pnpm install` échoue | Vérifiez que corepack est activé : `corepack enable` |
| Docker containers ne démarrent pas | Vérifiez les ports (5432, 6379, 6333, 11434) |
| Alembic migration échoue | Vérifiez que PostgreSQL est accessible |
| Ollama lent au premier appel | Normal — le modèle se charge en RAM/GPU au premier usage |
| Hot reload ne fonctionne pas | Vérifiez que vous utilisez `make dev-engine` (uvicorn --reload) |