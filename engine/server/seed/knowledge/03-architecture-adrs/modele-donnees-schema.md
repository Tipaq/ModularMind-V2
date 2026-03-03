# Modèle de données — Schéma conceptuel ModularMind

## Vue d'ensemble

Le modèle de données de ModularMind est réparti entre deux bases PostgreSQL : l'Engine DB (données opérationnelles) et la Platform DB (données de configuration et administration).

## Engine DB — Schéma principal

### Entités et relations

```
┌────────────┐     ┌────────────────┐     ┌────────────────┐
│   users    │──1:N──│ conversations  │──1:N──│   messages     │
│            │     │                │     │                │
│ id (PK)    │     │ id (PK)        │     │ id (PK)        │
│ email      │     │ user_id (FK)   │     │ conversation_id│
│ name       │     │ agent_id       │     │ role           │
│ role       │     │ title          │     │ content        │
│ groups[]   │     │ status         │     │ metadata (JSON)│
│ password   │     │ created_at     │     │ created_at     │
│ created_at │     │ updated_at     │     └────────────────┘
└────────────┘     └────────────────┘
      │
      │ 1:N
      ▼
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│ memory_entries │──N:N──│ memory_edges  │     │ consolidation  │
│                │     │                │     │   _logs         │
│ id (PK)        │     │ id (PK)        │     │                │
│ scope          │     │ source_id (FK) │     │ id (PK)        │
│ scope_id       │     │ target_id (FK) │     │ scope          │
│ user_id (FK)   │     │ edge_type      │     │ scope_id       │
│ tier           │     │ weight         │     │ action         │
│ memory_type    │     │ shared_entities│     │ source_ids[]   │
│ content        │     │ created_at     │     │ result_id      │
│ importance     │     └────────────────┘     │ details (JSON) │
│ access_count   │                             │ created_at     │
│ metadata (JSON)│                             └────────────────┘
│ expired_at     │
│ created_at     │
└────────────────┘
```

### RAG (Knowledge Base)

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│ rag_collections│──1:N──│ rag_documents │──1:N──│  rag_chunks    │
│                │     │                │     │                │
│ id (PK)        │     │ id (PK)        │     │ id (PK)        │
│ name           │     │ collection_id  │     │ document_id    │
│ description    │     │ filename       │     │ collection_id  │
│ scope          │     │ content_type   │     │ content        │
│ allowed_groups│     │ size_bytes     │     │ chunk_index    │
│ owner_user_id │     │ status         │     │ metadata (JSON)│
│ chunk_size     │     │ chunk_count    │     │ created_at     │
│ chunk_overlap  │     │ error_message  │     └────────────────┘
│ document_count │     │ metadata (JSON)│
│ chunk_count    │     │ created_at     │         Vectors stored
│ metadata (JSON)│     └────────────────┘         in Qdrant
│ created_at     │                                (not in PG)
└────────────────┘
```

## Cardinalités

| Relation | Cardinalité | Description |
|----------|-------------|-------------|
| User → Conversations | 1:N | Un utilisateur a plusieurs conversations |
| Conversation → Messages | 1:N | Une conversation contient plusieurs messages |
| User → MemoryEntries | 1:N | Un utilisateur a plusieurs souvenirs |
| MemoryEntry → MemoryEdges | N:N | Les souvenirs sont liés entre eux |
| RAGCollection → RAGDocuments | 1:N | Une collection contient plusieurs documents |
| RAGDocument → RAGChunks | 1:N | Un document est découpé en chunks |

## Enums et types

### MemoryScope
```
AGENT            — Mémoire spécifique à un agent
USER_PROFILE     — Profil et préférences utilisateur
CONVERSATION     — Contexte de conversation unique
CROSS_CONVERSATION — Connaissances inter-conversations
```

### MemoryTier
```
BUFFER   — Mémoires récentes et actives
SUMMARY  — Résumés consolidés
VECTOR   — Indexées dans Qdrant
ARCHIVE  — Anciennes, rarement accédées
```

### MemoryType
```
EPISODIC    — Événements et conversations (par défaut)
SEMANTIC    — Faits et concepts
PROCEDURAL  — Processus et savoir-faire
```

### RAGScope
```
GLOBAL — Accessible à tous les utilisateurs
GROUP  — Restreint aux groupes dans allowed_groups
AGENT  — Privé à owner_user_id
```

### DocumentStatus
```
PENDING    — En attente de traitement
PROCESSING — En cours de chunking/embedding
READY      — Traitement terminé, recherchable
FAILED     — Erreur de traitement
```

### EdgeType
```
ENTITY_OVERLAP      — Entités partagées entre mémoires
SAME_CATEGORY       — Même catégorie de métadonnées
SEMANTIC_SIMILARITY — Haute similarité vectorielle
SAME_TAG            — Tags communs
```

## Index et performances

### Index principaux (Engine DB)

| Table | Index | Colonnes | Justification |
|-------|-------|----------|---------------|
| conversations | ix_conv_user | user_id | Listing par utilisateur |
| conversations | ix_conv_agent | agent_id | Filtrage par agent |
| messages | ix_msg_conv | conversation_id | Messages d'une conversation |
| memory_entries | ix_mem_scope | scope, scope_id | Requêtes par portée |
| memory_entries | ix_mem_user | user_id | Mémoires d'un utilisateur |
| memory_entries | ix_mem_tier | scope, tier | Listing par tier |
| rag_documents | ix_doc_col | collection_id | Documents d'une collection |
| rag_chunks | ix_chunk_col | collection_id | Chunks par collection |
| rag_chunks | ix_chunk_doc | document_id, chunk_index | Chunks ordonnés |

### Contraintes

- `memory_edges`: UNIQUE(source_id, target_id) — un seul edge par paire
- `rag_collections`: name non-null, max 200 caractères
- `rag_documents`: filename non-null, max 500 caractères
- `users`: UNIQUE(email)

## Platform DB (Prisma)

La Platform DB est gérée par Prisma et contient les données d'administration :

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│   Client   │──1:N──│   Engine   │     │   Agent    │
│            │     │            │     │            │
│ id         │     │ id         │     │ id         │
│ name       │     │ name       │     │ name       │
│ slug       │     │ client_id  │     │ config     │
│ config     │     │ api_key    │     │ version    │
└────────────┘     │ last_seen  │     └────────────┘
                   └────────────┘
                         │
                    ┌────┴─────┐
                    │  Graph   │
                    │          │
                    │ id       │
                    │ name     │
                    │ nodes    │
                    │ edges    │
                    │ version  │
                    └──────────┘
```

## Synchronisation Platform → Engine

Les données circulent dans un seul sens : Platform → Engine via le mécanisme de sync polling. L'Engine ne modifie jamais les données de la Platform. Les données opérationnelles (conversations, messages, mémoires, documents RAG) restent exclusivement dans l'Engine DB.
