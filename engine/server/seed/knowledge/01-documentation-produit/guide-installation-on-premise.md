# Guide d'installation On-Premise — ModularMind

## Vue d'ensemble

Ce guide détaille l'installation de ModularMind sur votre propre infrastructure. Le déploiement on-premise vous offre un contrôle total sur vos données et votre environnement, idéal pour les entreprises avec des exigences strictes de conformité.

## Configuration matérielle requise

### Serveur principal (API + Worker)

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 16 Go | 32 Go |
| Stockage SSD | 100 Go | 500 Go |
| Réseau | 1 Gbps | 10 Gbps |

### Serveur GPU (Ollama — optionnel si providers cloud uniquement)

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| GPU | NVIDIA T4 (16 Go VRAM) | NVIDIA A100 (40 Go VRAM) |
| RAM système | 32 Go | 64 Go |
| Stockage NVMe | 200 Go | 1 To |

### Base de données PostgreSQL

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 8 Go | 16 Go |
| Stockage SSD | 50 Go | 200 Go |

## Architecture de déploiement

```
                    ┌─────────────┐
                    │   Nginx     │
                    │  (Reverse   │
                    │   Proxy)    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴────┐ ┌─────┴─────┐
        │  Chat SPA  │ │Ops SPA │ │  Engine   │
        │  (Static)  │ │(Static)│ │  (FastAPI)│
        └────────────┘ └────────┘ └─────┬─────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              ┌─────┴─────┐     ┌──────┴──────┐    ┌──────┴──────┐
              │ PostgreSQL │     │    Redis     │    │   Qdrant    │
              │   (Data)   │     │  (Streams +  │    │  (Vector    │
              │            │     │   Cache)     │    │   Store)    │
              └────────────┘     └─────────────┘    └─────────────┘
```

## Installation pas à pas

### 1. Préparer le système

```bash
# Ubuntu 22.04 / Debian 12
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential

# Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Installer Docker Compose v2
sudo apt install -y docker-compose-plugin
```

### 2. Configurer les certificats SSL

```bash
# Avec Let's Encrypt (production)
sudo apt install -y certbot
sudo certbot certonly --standalone -d modularmind.votredomaine.fr

# Ou avec un certificat auto-signé (développement)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/modularmind.key \
  -out /etc/ssl/certs/modularmind.crt
```

### 3. Configurer les variables d'environnement

Créez le fichier `.env.production` :

```env
# Base de données
DATABASE_URL=postgresql+asyncpg://modularmind:VOTRE_MOT_DE_PASSE@db:5432/modularmind
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10

# Redis
REDIS_URL=redis://redis:6379/0

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=VOTRE_CLE_QDRANT

# Sécurité
JWT_SECRET=GENEREZ_UN_SECRET_UNIQUE_DE_64_CARACTERES
CORS_ORIGINS=https://modularmind.votredomaine.fr

# LLM Providers
OLLAMA_BASE_URL=http://ollama:11434
OPENAI_API_KEY=sk-...           # Optionnel
ANTHROPIC_API_KEY=sk-ant-...    # Optionnel

# Embedding
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
```

### 4. Lancer le déploiement

```bash
make deploy
```

Cette commande exécute `docker compose -f docker/docker-compose.yml up -d` avec les 7 conteneurs : nginx, engine, worker, db, redis, qdrant, ollama.

### 5. Vérification post-installation

```bash
# Santé de l'API
curl -k https://modularmind.votredomaine.fr/health

# Logs des services
docker compose -f docker/docker-compose.yml logs -f engine
docker compose -f docker/docker-compose.yml logs -f worker
```

## Maintenance

### Sauvegardes

Configurez des sauvegardes automatiques quotidiennes :

```bash
# PostgreSQL
pg_dump -h localhost -U modularmind modularmind > backup_$(date +%Y%m%d).sql

# Qdrant (snapshots)
curl -X POST http://localhost:6333/collections/knowledge/snapshots

# Redis (si persistence activée)
redis-cli BGSAVE
```

### Mises à jour

```bash
git pull origin main
make build
make deploy
make migrate
```

## Support

Pour tout problème d'installation, contactez l'équipe infrastructure à infra@modularmind.io ou ouvrez un ticket sur le portail support interne.
