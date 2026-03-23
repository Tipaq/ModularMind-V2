# Spécification — Marketplace de Templates

## Vue d'ensemble

La marketplace permet aux utilisateurs de ModularMind de partager et d'installer des templates d'agents, de graphes de workflows, et de plugins MCP. Elle est accessible depuis le Platform (Studio) et via l'API publique.

## Types de Templates

### 1. Agent Templates

Un template d'agent encapsule la configuration complète d'un agent :

```json
{
  "type": "agent",
  "name": "Customer Support Bot",
  "version": "1.2.0",
  "description": "Agent de support client multi-canal avec RAG et mémoire",
  "config": {
    "system_prompt": "Tu es un agent de support client...",
    "model": "gpt-4o-mini",
    "fallback_model": "ollama/llama3:8b",
    "temperature": 0.3,
    "max_tokens": 2048,
    "tools": ["rag_search", "create_ticket", "send_email"],
    "memory_enabled": true,
    "memory_scopes": ["user_profile", "cross_conversation"],
    "rag_collections": ["support_faq", "product_docs"]
  },
  "tags": ["support", "customer-service", "rag"],
  "category": "customer-service",
  "author": {
    "name": "ModularMind Team",
    "verified": true
  }
}
```

### 2. Graph Templates

Un template de graphe contient le workflow LangGraph complet :

```json
{
  "type": "graph",
  "name": "RAG with Reranking Pipeline",
  "version": "2.0.0",
  "description": "Pipeline RAG avancé avec query expansion, retrieval multi-collection, et reranking Cohere",
  "config": {
    "nodes": [
      {"id": "query_expansion", "type": "llm_node", "model": "gpt-4o-mini"},
      {"id": "retriever", "type": "rag_search", "top_k": 20},
      {"id": "reranker", "type": "cohere_rerank", "top_k": 5},
      {"id": "generator", "type": "llm_node", "model": "gpt-4o"}
    ],
    "edges": [
      {"from": "START", "to": "query_expansion"},
      {"from": "query_expansion", "to": "retriever"},
      {"from": "retriever", "to": "reranker"},
      {"from": "reranker", "to": "generator"},
      {"from": "generator", "to": "END"}
    ]
  },
  "tags": ["rag", "reranking", "advanced"],
  "category": "rag-pipelines"
}
```

### 3. MCP Plugin Templates

Un template de plugin MCP décrit un outil externe :

```json
{
  "type": "mcp_plugin",
  "name": "Jira Integration",
  "version": "1.0.0",
  "description": "Permet aux agents de créer, mettre à jour et rechercher des tickets Jira",
  "config": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modularmind/mcp-jira"],
    "env_required": ["JIRA_URL", "JIRA_TOKEN"],
    "tools_provided": [
      "jira_create_issue",
      "jira_search_issues",
      "jira_update_issue",
      "jira_get_issue"
    ]
  },
  "tags": ["jira", "project-management", "ticketing"],
  "category": "integrations"
}
```

## Modèle de Données

```sql
CREATE TABLE marketplace_templates (
    id UUID PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('agent', 'graph', 'mcp_plugin')),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    tags TEXT[] DEFAULT '{}',
    author_id UUID NOT NULL REFERENCES users(id),
    is_verified BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT true,
    download_count INT DEFAULT 0,
    avg_rating DECIMAL(2,1) DEFAULT 0,
    rating_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE template_versions (
    id UUID PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES marketplace_templates(id),
    version VARCHAR(20) NOT NULL,
    config JSONB NOT NULL,
    changelog TEXT,
    min_engine_version VARCHAR(20),
    published_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_id, version)
);

CREATE TABLE template_reviews (
    id UUID PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES marketplace_templates(id),
    user_id UUID NOT NULL REFERENCES users(id),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_id, user_id)
);

CREATE TABLE template_installs (
    id UUID PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES marketplace_templates(id),
    version_id UUID NOT NULL REFERENCES template_versions(id),
    tenant_id UUID NOT NULL,
    installed_by UUID NOT NULL REFERENCES users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Categories

| Catégorie | Description | Templates estimés |
|-----------|-------------|------------------|
| `customer-service` | Support client, FAQ, ticketing | 15 |
| `sales` | Qualification leads, outreach, proposals | 8 |
| `hr` | Onboarding, FAQ employés, recrutement | 6 |
| `rag-pipelines` | Pipelines RAG avancés | 10 |
| `integrations` | Plugins MCP (Jira, Slack, GitHub, etc.) | 20 |
| `analytics` | Reporting, extraction données, dashboards | 5 |
| `content` | Génération contenu, traduction, résumé | 12 |
| `coding` | Code review, documentation, debugging | 8 |

## API Endpoints

### Public (avec API key)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/marketplace/templates` | Lister avec filtres (type, category, tags) |
| GET | `/marketplace/templates/{slug}` | Détails d'un template |
| GET | `/marketplace/templates/{slug}/versions` | Versions disponibles |
| POST | `/marketplace/templates/{slug}/install` | Installer un template |
| GET | `/marketplace/categories` | Lister les catégories |
| GET | `/marketplace/featured` | Templates mis en avant |

### Authenticated (auteur)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/marketplace/templates` | Publier un template |
| PUT | `/marketplace/templates/{slug}` | Modifier un template |
| POST | `/marketplace/templates/{slug}/versions` | Publier une nouvelle version |
| DELETE | `/marketplace/templates/{slug}` | Retirer un template |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/marketplace/templates/{slug}/verify` | Marquer comme vérifié |
| PUT | `/marketplace/templates/{slug}/feature` | Mettre en avant |
| DELETE | `/marketplace/templates/{slug}/admin` | Supprimer (modération) |

## Processus de Publication

```
1. Auteur soumet le template (POST /marketplace/templates)
2. Validation automatique :
   - Schema JSON valide
   - Pas de secrets dans le config
   - Version engine compatible
3. Review manuelle (si première publication de l'auteur)
4. Publication visible dans le catalogue
5. Badge "Verified" après review par l'équipe ModularMind
```

## Installation Flow

```
1. User clique "Install" sur un template
2. Platform vérifie la compatibilité engine
3. Si MCP plugin : vérifie les env vars requises, demande les valeurs
4. Copie le config dans le tenant :
   - Agent → crée un nouveau AgentConfig
   - Graph → crée un nouveau GraphConfig
   - MCP → ajoute au MCP registry
5. Template fonctionnel immédiatement
```
