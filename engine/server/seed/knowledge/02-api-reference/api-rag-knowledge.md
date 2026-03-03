# API Reference — RAG & Knowledge Base

## Overview

The RAG (Retrieval-Augmented Generation) API manages document collections, file uploads, and semantic search. Documents are automatically chunked, embedded, and indexed for hybrid search (dense vectors + BM25).

## Collection Endpoints

### GET /rag/collections

List accessible collections for the authenticated user.

**Access Control:**
- `GLOBAL` scope: visible to all users
- `GROUP` scope: visible if user belongs to one of `allowed_groups`
- `AGENT` scope: visible only to `owner_user_id`

**Response (200):**
```json
{
  "items": [
    {
      "id": "col_product_docs",
      "name": "Documentation Produit",
      "description": "Guides utilisateur et documentation technique de ModularMind",
      "scope": "global",
      "allowed_groups": [],
      "document_count": 42,
      "chunk_count": 1250,
      "chunk_size": 500,
      "chunk_overlap": 50,
      "last_sync": "2026-03-01T08:00:00Z",
      "created_at": "2025-08-01T10:00:00Z"
    },
    {
      "id": "col_engineering",
      "name": "Architecture & ADRs",
      "description": "Architecture Decision Records et documentation technique interne",
      "scope": "group",
      "allowed_groups": ["engineering", "devops"],
      "document_count": 15,
      "chunk_count": 380,
      "chunk_size": 500,
      "chunk_overlap": 50,
      "last_sync": "2026-02-28T16:00:00Z",
      "created_at": "2025-09-15T10:00:00Z"
    }
  ],
  "total": 6
}
```

### POST /rag/collections

Create a new collection.

**Request:**
```json
{
  "name": "Support Client FAQ",
  "description": "Base de connaissances pour le support client",
  "scope": "group",
  "allowed_groups": ["support", "sales"],
  "metadata": {
    "chunk_strategy": "token_aware"
  }
}
```

**Scope Rules:**
- `global`: requires `admin` or `operator` role
- `group`: requires `allowed_groups` to be specified
- `agent`: `owner_user_id` is auto-set to the current user

**Response (201):**
```json
{
  "id": "col_support_faq",
  "name": "Support Client FAQ",
  "scope": "group",
  "allowed_groups": ["support", "sales"],
  "document_count": 0,
  "chunk_count": 0,
  "created_at": "2026-03-01T10:00:00Z"
}
```

### DELETE /rag/collections/{collection_id}

Delete a collection and all its documents, chunks, and vectors.

**Side Effects:**
- All RAGDocuments in the collection are deleted
- All RAGChunks are deleted from PostgreSQL
- All vectors are deleted from Qdrant (best-effort)

**Response (204):** No content.

## Document Endpoints

### GET /rag/collections/{collection_id}/documents

List documents in a collection.

**Response (200):**
```json
{
  "items": [
    {
      "id": "doc_guide_install",
      "filename": "guide-installation-on-premise.md",
      "content_type": "text/markdown",
      "size_bytes": 12450,
      "chunk_count": 28,
      "status": "ready",
      "error_message": null,
      "created_at": "2026-01-15T10:00:00Z"
    },
    {
      "id": "doc_api_ref",
      "filename": "api-reference.pdf",
      "content_type": "application/pdf",
      "size_bytes": 2540000,
      "chunk_count": 0,
      "status": "processing",
      "error_message": null,
      "created_at": "2026-03-01T09:55:00Z"
    }
  ],
  "total": 42
}
```

### POST /rag/collections/{collection_id}/documents/upload

Upload a document for processing.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Document file |

**Supported Formats:**

| Extension | MIME Type | Max Size |
|-----------|----------|----------|
| `.pdf` | application/pdf | 50 MB |
| `.docx` | application/vnd.openxmlformats... | 50 MB |
| `.doc` | application/msword | 50 MB |
| `.txt` | text/plain | 50 MB |
| `.md` | text/markdown | 50 MB |

**Processing Pipeline:**
```
Upload → Validate → Extract Text → Chunk → Embed → Store in Qdrant
         (sync)     (async worker)
```

**Response (201):**
```json
{
  "id": "doc_new_guide",
  "filename": "new-feature-guide.md",
  "content_type": "text/markdown",
  "size_bytes": 8500,
  "status": "processing",
  "created_at": "2026-03-01T10:05:00Z"
}
```

**Document Status Flow:**
```
pending → processing → ready    (success)
                     → failed   (error)
```

### DELETE /rag/collections/{collection_id}/documents/{document_id}

Delete a document and its chunks/vectors.

**Response (204):** No content.

## Search Endpoint

### POST /rag/search

Perform hybrid semantic search across accessible collections.

**Request:**
```json
{
  "query": "How to configure rate limiting in ModularMind?",
  "collection_ids": ["col_product_docs", "col_engineering"],
  "limit": 10,
  "threshold": 0.7
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | — | Search query (1-1000 chars) |
| `collection_ids` | string[] | null | Filter by collections (null = all accessible) |
| `limit` | int | 10 | Max results (1-50) |
| `threshold` | float | 0.7 | Min relevance score (0-1) |

**Response (200):**
```json
{
  "results": [
    {
      "chunk": {
        "id": "chk_abc123",
        "document_id": "doc_guide_config",
        "collection_id": "col_product_docs",
        "content": "Rate limiting in ModularMind is configured at two levels: per-user and per-IP. The per-user limit defaults to 60 requests per minute and can be adjusted in the system settings...",
        "chunk_index": 14
      },
      "score": 0.94,
      "document_filename": "guide-configuration.md"
    },
    {
      "chunk": {
        "id": "chk_def456",
        "document_id": "doc_api_ref",
        "collection_id": "col_product_docs",
        "content": "All API endpoints support rate limiting via the X-RateLimit headers. Configure custom limits per endpoint in the admin console under Settings > Security > Rate Limits...",
        "chunk_index": 7
      },
      "score": 0.88,
      "document_filename": "api-reference.md"
    }
  ],
  "total": 2,
  "search_mode": "hybrid",
  "reranked": false,
  "warning": null
}
```

**Search Strategy:**
1. Dense vector search (cosine similarity, 768-dim embeddings)
2. Sparse BM25 text search
3. Reciprocal Rank Fusion (RRF) to combine scores
4. Optional reranking (Cohere or cross-encoder)
5. Double-gate ACL: PostgreSQL scope check + Qdrant payload filter

### GET /rag/supported-formats

Get supported file formats and size limits.

**Response (200):**
```json
{
  "formats": [".docx", ".md", ".markdown", ".pdf", ".txt"],
  "max_size_bytes": 52428800
}
```

## Chunking Strategies

Collections support different chunking strategies via the `metadata.chunk_strategy` field:

| Strategy | Description | Best For |
|----------|-------------|----------|
| `recursive` | Character-based recursive splitting | General purpose (default) |
| `token_aware` | Token-based splitting (tiktoken) | Precise token control |
| `parent_child` | Hierarchical parent/child chunks | Long documents with structure |
| `semantic` | Embedding-similarity grouping | Topically coherent chunks |

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `unsupported_format` | File type not in supported formats |
| 400 | `file_too_large` | File exceeds 50 MB limit |
| 403 | `collection_access_denied` | User lacks group membership |
| 404 | `collection_not_found` | Collection ID doesn't exist |
| 404 | `document_not_found` | Document ID doesn't exist |
| 422 | `empty_query` | Search query is empty |
