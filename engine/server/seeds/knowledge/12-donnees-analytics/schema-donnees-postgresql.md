# PostgreSQL Database Schema Documentation

## Overview

ModularMind uses PostgreSQL 16 as its primary relational database. The schema is managed via Alembic migrations (engine) and Prisma (platform).

## Engine Database Tables

### Core Tables

#### users
| Column | Type | Constraints |
|--------|------|-------------|
| id | VARCHAR(36) | PK, UUID |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| name | VARCHAR(200) | NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| role | VARCHAR(20) | NOT NULL (admin/operator/user) |
| groups | JSONB | DEFAULT '[]' |
| is_active | BOOLEAN | DEFAULT true |
| last_login | TIMESTAMP | NULLABLE |
| created_at | TIMESTAMP | DEFAULT now() |

#### conversations
| Column | Type | Constraints |
|--------|------|-------------|
| id | VARCHAR(36) | PK, UUID |
| user_id | VARCHAR(36) | FK → users.id, NOT NULL |
| agent_id | VARCHAR(100) | NOT NULL |
| title | VARCHAR(500) | NULLABLE |
| status | VARCHAR(20) | DEFAULT 'active' |
| metadata | JSONB | DEFAULT '{}' |
| created_at | TIMESTAMP | DEFAULT now() |
| updated_at | TIMESTAMP | DEFAULT now() |

#### messages
| Column | Type | Constraints |
|--------|------|-------------|
| id | VARCHAR(36) | PK, UUID |
| conversation_id | VARCHAR(36) | FK → conversations.id, NOT NULL |
| role | VARCHAR(20) | NOT NULL (user/assistant/system/tool) |
| content | TEXT | NOT NULL |
| metadata | JSONB | DEFAULT '{}' |
| created_at | TIMESTAMP | DEFAULT now() |

### RAG Tables

#### rag_collections
| Column | Type | Constraints |
|--------|------|-------------|
| id | VARCHAR(36) | PK, UUID |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | NULLABLE |
| scope | VARCHAR(20) | NOT NULL (global/group/agent) |
| allowed_groups | JSONB | DEFAULT '[]' |
| owner_user_id | VARCHAR(36) | FK → users.id, NULLABLE |
| chunk_size | INTEGER | DEFAULT 500 |
| chunk_overlap | INTEGER | DEFAULT 50 |
| document_count | INTEGER | DEFAULT 0 |
| chunk_count | INTEGER | DEFAULT 0 |
| metadata | JSONB | DEFAULT '{}' |
| last_sync | TIMESTAMP | NULLABLE |
| created_at | TIMESTAMP | DEFAULT now() |

#### rag_documents
(See previous documentation for full schema)

#### rag_chunks
(See previous documentation for full schema)

### Memory Tables

#### memory_entries
(See memory system documentation for full schema)

#### memory_edges
(See memory system documentation for full schema)

#### memory_consolidation_logs
(See memory system documentation for full schema)

## Key Indexes

```sql
-- Conversations
CREATE INDEX ix_conversations_user_id ON conversations(user_id);
CREATE INDEX ix_conversations_agent_id ON conversations(agent_id);

-- Messages
CREATE INDEX ix_messages_conversation_id ON messages(conversation_id);

-- Memory
CREATE INDEX ix_memory_entries_scope_id ON memory_entries(scope_id);
CREATE INDEX ix_memory_entries_user_id ON memory_entries(user_id);
CREATE INDEX ix_memory_scope_tier ON memory_entries(scope, tier);
CREATE INDEX ix_memory_entries_memory_type ON memory_entries(memory_type);

-- RAG
CREATE INDEX ix_rag_documents_collection_id ON rag_documents(collection_id);
CREATE INDEX ix_chunk_collection ON rag_chunks(collection_id);
CREATE INDEX ix_chunk_document_index ON rag_chunks(document_id, chunk_index);
```

## Migration Strategy

- Alembic for schema migrations
- All migrations must be backwards-compatible (new code works with old AND new schema)
- Migration naming: `{hash}_{description}.py`
- Always test migration + rollback on staging before production