# Qdrant Collections & Indexing Guide

## Collections

ModularMind uses two Qdrant collections:

### knowledge (RAG)

Stores document chunk embeddings for the RAG pipeline.

```python
# Collection configuration
collection_name = "knowledge"  # Configurable via QDRANT_COLLECTION_KNOWLEDGE

vectors_config = {
    "dense": VectorParams(size=768, distance=Distance.COSINE, on_disk=True),
}
sparse_vectors_config = {
    "sparse": SparseVectorParams(),
}
```

### memory

Stores memory entry embeddings for the memory system.

```python
collection_name = "memory"  # Configurable via QDRANT_COLLECTION_MEMORY

vectors_config = {
    "dense": VectorParams(size=768, distance=Distance.COSINE, on_disk=True),
}
sparse_vectors_config = {
    "sparse": SparseVectorParams(),
}
```

## Payload Indexes

Payload indexes are created for frequently filtered fields to accelerate search:

```python
indexed_fields = [
    "scope",           # KEYWORD — filter by GLOBAL/GROUP/AGENT
    "group_slugs",     # KEYWORD — filter by user group membership
    "agent_id",        # KEYWORD — filter by agent
    "user_id",         # KEYWORD — filter by user
    "document_id",     # KEYWORD — filter by source document
    "collection_id",   # KEYWORD — filter by RAG collection
    "conversation_id", # KEYWORD — filter by conversation
    "memory_type",     # KEYWORD — filter by episodic/semantic/procedural
]
```

## Search Strategies

### Dense-Only Search
```python
# Simple vector similarity search
results = client.search(
    collection_name="knowledge",
    query_vector=("dense", query_embedding),
    limit=10,
    query_filter=filter_condition,
)
```

### Hybrid Search (Dense + Sparse)
```python
# Reciprocal Rank Fusion of dense + BM25
results = client.query_points(
    collection_name="knowledge",
    prefetch=[
        Prefetch(query=("dense", dense_vector), limit=20),
        Prefetch(query=("sparse", sparse_vector), limit=20),
    ],
    query=FusionQuery(fusion=Fusion.RRF),
    limit=10,
    query_filter=filter_condition,
)
```

## Performance Tuning

### On-Disk Storage

For collections > 100K vectors, enable on-disk storage to reduce RAM usage:

```python
client.update_collection(
    collection_name="knowledge",
    vectors_config={"dense": VectorParams(on_disk=True)},
    optimizers_config=OptimizersConfig(memmap_threshold=10000),
)
```

### Quantization

For collections > 1M vectors, enable scalar quantization to reduce memory by 4x:

```python
client.update_collection(
    collection_name="knowledge",
    quantization_config=ScalarQuantization(
        scalar=ScalarQuantizationConfig(type=ScalarType.INT8, always_ram=True),
    ),
)
```

## Snapshot Management

### Manual Snapshot
```bash
curl -X POST http://localhost:6333/collections/knowledge/snapshots
```

### Automated Snapshots
Configured in the Worker APScheduler to run daily at 02:00 UTC.

### Restore from Snapshot
```bash
curl -X PUT http://localhost:6333/collections/knowledge/snapshots/recover   -H "Content-Type: application/json"   -d '{"location": "/qdrant/snapshots/knowledge/snapshot_name.snapshot"}'
```