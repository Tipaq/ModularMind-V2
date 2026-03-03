# ADR-003: Vector Store Selection — Qdrant vs Pinecone vs Weaviate

## Status

**Accepted** — 2025-08-01

## Context

ModularMind requires a vector database for two primary use cases:

1. **RAG (Knowledge Base)**: Store document chunk embeddings for semantic search
2. **Memory System**: Store memory entry embeddings for contextual recall

Requirements:
- Hybrid search (dense vectors + sparse/keyword)
- Payload filtering (scope, group, user-level ACL)
- Self-hosting option (on-premise deployments)
- Scalable to millions of vectors
- Low-latency search (< 100ms P95)

## Options Considered

### Option A: Pinecone

| Criteria | Rating | Notes |
|----------|--------|-------|
| Hybrid search | Good | Sparse-dense vectors supported |
| Payload filtering | Good | Metadata filtering with AND/OR |
| Self-hosting | Not available | Cloud-only, managed service |
| Pricing | Expensive | $70/month starter, scales with usage |
| Performance | Excellent | Optimized managed infrastructure |
| API quality | Good | Simple REST + gRPC, official SDKs |

**Verdict:** Eliminated due to cloud-only requirement. On-premise deployments are a core feature for enterprise clients.

### Option B: Weaviate

| Criteria | Rating | Notes |
|----------|--------|-------|
| Hybrid search | Excellent | BM25 + vector natively |
| Payload filtering | Excellent | GraphQL-based, very flexible |
| Self-hosting | Available | Docker, Kubernetes, Helm charts |
| Pricing | Free (self-hosted) | Cloud pricing for managed |
| Performance | Good | Go-based, HNSW index |
| API quality | Complex | GraphQL learning curve |

**Verdict:** Strong option but GraphQL API adds complexity. The schema-first approach (class definitions) is heavier than needed.

### Option C: Qdrant

| Criteria | Rating | Notes |
|----------|--------|-------|
| Hybrid search | Excellent | Named vectors (dense + sparse) |
| Payload filtering | Excellent | Rich filter DSL, payload indexes |
| Self-hosting | Available | Docker, single binary, Kubernetes |
| Pricing | Free (self-hosted) | Cloud option available |
| Performance | Excellent | Rust-based, HNSW + quantization |
| API quality | Excellent | Clean REST + gRPC, Python/JS SDKs |

**Verdict:** Best combination of features, performance, and simplicity.

## Decision

**We chose Option C: Qdrant.**

### Key Factors

1. **Self-hosting**: Single Docker container, minimal resource footprint. Critical for enterprise on-premise deployments.

2. **Hybrid search with named vectors**: Qdrant supports multiple named vectors per point, allowing us to store both dense (768-dim) and sparse (BM25) vectors in the same collection. This enables true hybrid search with Reciprocal Rank Fusion (RRF).

3. **Payload filtering**: Qdrant's filter DSL supports complex ACL patterns:
```json
{
  "should": [
    { "key": "scope", "match": { "value": "global" } },
    {
      "must": [
        { "key": "scope", "match": { "value": "group" } },
        { "key": "group_slugs", "match": { "any": ["engineering"] } }
      ]
    }
  ]
}
```

4. **Performance**: Rust-based engine delivers sub-50ms P95 latency for our typical workload (100K vectors, 768-dim, with filters).

5. **Simplicity**: Clean REST API with excellent Python SDK (`qdrant-client`). No schema definitions required — just upsert points with payloads.

## Implementation

### Collection Configuration

```python
# Knowledge collection (RAG)
client.create_collection(
    collection_name="knowledge",
    vectors_config={
        "dense": models.VectorParams(
            size=768,
            distance=models.Distance.COSINE,
            on_disk=True,
        ),
    },
    sparse_vectors_config={
        "sparse": models.SparseVectorParams(),
    },
)
```

### Payload Indexes

```python
# Create indexes for frequently filtered fields
for field in ["scope", "group_slugs", "agent_id", "user_id",
              "document_id", "collection_id", "conversation_id"]:
    client.create_payload_index(
        collection_name="knowledge",
        field_name=field,
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
```

### Benchmark Results (100K vectors, 768-dim)

| Operation | P50 | P95 | P99 |
|-----------|-----|-----|-----|
| Upsert (batch 100) | 12ms | 25ms | 45ms |
| Dense search (top 10) | 8ms | 18ms | 35ms |
| Hybrid search (top 10) | 15ms | 32ms | 55ms |
| Filtered search | 10ms | 22ms | 40ms |
| Delete by filter | 5ms | 12ms | 20ms |

## Consequences

### Positive
- Single Docker container for all vector storage needs
- Hybrid search provides significantly better retrieval quality than dense-only
- Payload filtering enables fine-grained ACL without post-filtering
- On-disk storage option for large collections with limited RAM

### Negative
- Less community adoption compared to Pinecone/Weaviate (growing rapidly)
- No built-in reranking (implemented externally via Cohere/cross-encoder)
- Snapshot-based backup (no streaming replication like PostgreSQL)

### Migration Path
- If needed, switching to another vector store requires reimplementing the `QdrantVectorStore` class only — the repository layer abstracts the vector store interface.
