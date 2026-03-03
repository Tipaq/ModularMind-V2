# Guide de démarrage rapide — ModularMind

## Introduction

Bienvenue sur ModularMind, la plateforme d'orchestration d'agents IA multi-modèles. Ce guide vous accompagne dans vos premiers pas : de l'installation à votre première conversation avec un agent intelligent.

## Prérequis

Avant de commencer, assurez-vous de disposer des éléments suivants :

- **Docker** v24+ et **Docker Compose** v2.20+
- **Python** 3.12 ou supérieur
- **Node.js** 20 LTS avec **pnpm** 9+
- Minimum **8 Go de RAM** disponibles (16 Go recommandés)
- **20 Go d'espace disque** libre pour les modèles et les données
- Un accès réseau pour télécharger les modèles LLM

## Installation en 5 minutes

### Étape 1 : Cloner le dépôt

```bash
git clone https://github.com/modularmind/modularmind-v2.git
cd modularmind-v2
```

### Étape 2 : Configurer l'environnement

Copiez le fichier d'environnement et ajustez les variables :

```bash
cp engine/server/.env.example engine/server/.env
```

Les variables essentielles à configurer :

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `DATABASE_URL` | URL PostgreSQL | `postgresql+asyncpg://mm:mm@localhost:5432/modularmind` |
| `REDIS_URL` | URL Redis | `redis://localhost:6379/0` |
| `QDRANT_URL` | URL Qdrant | `http://localhost:6333` |
| `OLLAMA_BASE_URL` | URL Ollama | `http://localhost:11434` |
| `JWT_SECRET` | Secret JWT (générez-en un unique) | — |

### Étape 3 : Lancer l'infrastructure

```bash
make dev-infra
```

Cette commande démarre PostgreSQL, Redis, Qdrant et Ollama via Docker Compose. Attendez que tous les services soient en état "healthy" (environ 30 secondes).

### Étape 4 : Installer les dépendances et migrer

```bash
make setup
make migrate
```

### Étape 5 : Démarrer les services

Dans des terminaux séparés :

```bash
make dev-engine    # API FastAPI sur http://localhost:8000
make dev-worker    # Worker Redis Streams + scheduler
make dev-chat      # Interface chat sur http://localhost:5173
make dev-ops       # Console admin sur http://localhost:5174
```

## Créer votre premier agent

1. Ouvrez la console d'administration à `http://localhost:5174`
2. Connectez-vous avec les identifiants par défaut : `admin@modularmind.io` / `changeme`
3. Naviguez vers **Agents > Créer un agent**
4. Remplissez les informations de base :
   - **Nom** : "Assistant Support"
   - **Modèle** : sélectionnez `llama3.1:8b` (téléchargé automatiquement via Ollama)
   - **Prompt système** : "Tu es un assistant de support technique pour ModularMind. Tu réponds de manière claire et concise aux questions des utilisateurs."
5. Cliquez sur **Sauvegarder**

## Votre première conversation

1. Ouvrez l'interface chat à `http://localhost:5173`
2. Cliquez sur **Nouvelle conversation**
3. Sélectionnez l'agent "Assistant Support"
4. Tapez votre premier message : "Bonjour, comment fonctionne le système de mémoire ?"
5. Observez la réponse en streaming (SSE) s'afficher en temps réel

## Prochaines étapes

- Configurez un **provider LLM externe** (OpenAI, Anthropic) pour des modèles plus puissants
- Explorez l'**éditeur de graphes** pour créer des workflows multi-étapes
- Alimentez la **base de connaissances** (RAG) avec vos propres documents
- Configurez le **système de mémoire** pour que vos agents se souviennent des conversations

Pour toute question, consultez la documentation complète ou contactez l'équipe support à support@modularmind.io.
