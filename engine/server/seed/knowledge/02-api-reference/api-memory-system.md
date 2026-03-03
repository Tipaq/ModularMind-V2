# API Reference — Memory System

## Overview

The Memory System API provides access to ModularMind's long-term memory capabilities. Memories are automatically extracted from conversations, stored with vector embeddings, and recalled during future interactions to provide contextual awareness.

## Memory Concepts

### Scopes

| Scope | Description | Use Case |
|-------|-------------|----------|
| `agent` | Memories specific to an agent | Agent-level knowledge |
| `user_profile` | User preferences and personal info | Personalization |
| `conversation` | Single conversation context | In-session recall |
| `cross_conversation` | Knowledge across conversations | Long-term learning |

### Tiers

| Tier | Description | Storage |
|------|-------------|---------|
| `buffer` | Recent, actively used memories | PostgreSQL + Qdrant |
| `summary` | Consolidated summaries | PostgreSQL + Qdrant |
| `vector` | Indexed but not frequently accessed | Qdrant |
| `archive` | Old, rarely accessed memories | PostgreSQL only |

### Types

| Type | Description | Example |
|------|-------------|---------|
| `episodic` | Events and conversations | "User reported a bug on March 1st" |
| `semantic` | Facts and concepts | "User prefers YAML over JSON" |
| `procedural` | Processes and how-to | "To reset the cache, run flush_all" |

## User Endpoints

### GET /memory

List memories for the authenticated user.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page |
| `tier` | string | — | Filter by tier |
| `memory_type` | string | — | Filter by type |
| `scope` | string | — | Filter by scope |

**Response (200):**
```json
{
  "items": [
    {
      "id": "mem_abc123",
      "scope": "user_profile",
      "scope_id": "usr_jean01",
      "tier": "buffer",
      "memory_type": "semantic",
      "content": "User prefers dark mode and uses VSCode as their primary IDE",
      "importance": 0.75,
      "access_count": 12,
      "last_accessed": "2026-03-01T09:00:00Z",
      "metadata": {
        "category": "preference",
        "entities": ["dark mode", "VSCode", "IDE"],
        "tags": ["ui", "tooling"]
      },
      "created_at": "2025-11-15T14:00:00Z"
    }
  ],
  "total": 45,
  "page": 1,
  "per_page": 20
}
```

### GET /memory/search

Search memories using hybrid vector + keyword search.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | — | Search query (required) |
| `limit` | int | 10 | Max results |
| `scope` | string | — | Filter by scope |
| `memory_type` | string | — | Filter by type |

**Response (200):**
```json
{
  "results": [
    {
      "entry": {
        "id": "mem_abc123",
        "content": "User prefers dark mode and uses VSCode",
        "scope": "user_profile",
        "memory_type": "semantic",
        "importance": 0.75
      },
      "score": 0.92,
      "relevance_breakdown": {
        "vector_similarity": 0.88,
        "recency": 0.95,
        "importance": 0.75,
        "frequency": 0.60
      }
    }
  ],
  "total": 3
}
```

**Scoring Formula:**
```
final_score = α * recency + β * importance + γ * relevance + δ * frequency
```
Where:
- `recency` = 0.995 ^ hours_since_last_access
- `importance` = stored importance value (0-1)
- `relevance` = Qdrant hybrid search score
- `frequency` = log(1 + access_count) / log(1 + max_access_count)

### GET /memory/stats/{scope}/{scope_id}

Get memory statistics for a specific scope.

**Response (200):**
```json
{
  "scope": "user_profile",
  "scope_id": "usr_jean01",
  "total_memories": 45,
  "by_tier": {
    "buffer": 12,
    "summary": 8,
    "vector": 20,
    "archive": 5
  },
  "by_type": {
    "episodic": 18,
    "semantic": 22,
    "procedural": 5
  },
  "oldest_memory": "2025-06-15T10:00:00Z",
  "newest_memory": "2026-03-01T09:00:00Z",
  "last_consolidation": "2026-02-28T02:00:00Z"
}
```

### DELETE /memory/{entry_id}

Soft-delete a memory (sets `expired_at` timestamp).

**Response (204):** No content.

## Admin Endpoints

All admin endpoints require the `admin` role.

### GET /memory/admin/stats/global

Aggregate statistics across all scopes.

**Response (200):**
```json
{
  "total_memories": 12450,
  "active_memories": 10200,
  "expired_memories": 2250,
  "by_scope": {
    "agent": 3200,
    "user_profile": 4500,
    "conversation": 2800,
    "cross_conversation": 1950
  },
  "by_tier": {
    "buffer": 2100,
    "summary": 1800,
    "vector": 5200,
    "archive": 3350
  },
  "unique_users": 156,
  "consolidation_runs_24h": 4
}
```

### GET /memory/admin/explore

Unified memory explorer with advanced filters.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `user_id` | string | Filter by user |
| `scope` | string | Filter by scope |
| `memory_type` | string | Filter by type |
| `tier` | string | Filter by tier |
| `include_expired` | bool | Include soft-deleted memories |
| `page` | int | Page number |
| `per_page` | int | Items per page |

### POST /memory/admin/{entry_id}/invalidate

Manually soft-delete a memory entry.

**Response (200):**
```json
{
  "message": "Memory entry invalidated",
  "entry_id": "mem_abc123",
  "expired_at": "2026-03-01T10:00:00Z"
}
```

### GET /memory/admin/graph

Get the memory relationship graph for visualization.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `scope` | string | Filter by scope |
| `scope_id` | string | Filter by scope ID |
| `min_weight` | float | Minimum edge weight (0-1) |

**Response (200):**
```json
{
  "nodes": [
    {
      "id": "mem_abc123",
      "content": "User prefers dark mode",
      "type": "semantic",
      "importance": 0.75,
      "tier": "buffer"
    }
  ],
  "edges": [
    {
      "source": "mem_abc123",
      "target": "mem_def456",
      "type": "entity_overlap",
      "weight": 0.8,
      "shared_entities": ["dark mode", "UI preferences"]
    }
  ]
}
```

### GET /memory/admin/consolidation/logs

View consolidation history.

**Response (200):**
```json
{
  "items": [
    {
      "id": "clog_001",
      "scope": "user_profile",
      "scope_id": "usr_jean01",
      "action": "merge",
      "source_entry_ids": ["mem_abc", "mem_def", "mem_ghi"],
      "result_entry_id": "mem_merged01",
      "details": {
        "reason": "high_similarity",
        "similarity_score": 0.92
      },
      "created_at": "2026-02-28T02:15:00Z"
    }
  ],
  "total": 234
}
```

## Memory Pipeline

The memory system processes memories through a multi-stage pipeline via Redis Streams:

```
Conversation Message
  → memory:raw (stream)
    → Fact Extractor (LLM-based)
      → memory:extracted (stream)
        → Embedder (vectorization)
          → PostgreSQL + Qdrant (storage)
            → Graph Builder (edge creation)
              → Scorer (importance calculation)
```

## Edge Types

| Edge Type | Description | Auto-created |
|-----------|-------------|-------------|
| `entity_overlap` | Memories share named entities | Yes |
| `same_category` | Memories in same metadata category | Yes |
| `semantic_similarity` | High cosine similarity between vectors | Yes |
| `same_tag` | Memories share metadata tags | Yes |
