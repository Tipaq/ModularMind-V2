# Embedding & Vectorization Pipeline

## Overview

ModularMind generates vector embeddings for two purposes: RAG document chunks and memory entries. Both use the same embedding infrastructure but different Qdrant collections.

## Embedding Providers

### Ollama (Default, Self-Hosted)

```python
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
# Produces 768-dimensional vectors
# Supports multilingual text
# Runs locally, no API costs
```

### OpenAI

```python
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
# Produces 1536-dimensional vectors
# Excellent quality, cloud-only
# Cost: $0.02 / 1M tokens
```

## Pipeline Architecture

```
Input Text
    │
    ▼
┌──────────────┐
│  Tokenizer   │  Count tokens, validate length
│  (tiktoken)  │  Max: 8192 tokens (model-dependent)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Batch       │  Group chunks into batches of 100
│  Assembler   │  Reduces API calls, improves throughput
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Embedding   │  Call Ollama/OpenAI embedding API
│  Provider    │  Retry with exponential backoff
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Cache       │  Cache query embeddings in Redis (1h TTL)
│  (Redis)     │  Document embeddings are NOT cached (one-time)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  BM25        │  Generate sparse vector (token frequencies)
│  Tokenizer   │  Used for hybrid search alongside dense vectors
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Qdrant      │  Upsert dense + sparse vectors with payload
│  Upsert      │  Batch upsert for performance
└──────────────┘
```

## Batch Processing

### Configuration

```python
EMBEDDING_BATCH_SIZE = 100     # Chunks per API call
EMBEDDING_MAX_RETRIES = 3      # Retries on failure
EMBEDDING_RETRY_DELAY = 1.0    # Base delay (exponential backoff)
```

### Performance Benchmarks

| Provider | Model | Batch Size | Throughput | Latency (P95) |
|----------|-------|-----------|------------|----------------|
| Ollama | nomic-embed-text | 100 | ~200 chunks/s | 500ms |
| OpenAI | text-embedding-3-small | 100 | ~500 chunks/s | 200ms |

## Caching Strategy

### Query Embedding Cache

Query embeddings (user search queries) are cached in Redis to avoid re-embedding identical queries:

```python
# Cache key format
cache_key = f"embed:{provider}:{model}:{hash(text)}"

# TTL: 1 hour
# Eviction: LRU when memory pressure
```

### Document Chunk Embeddings

Document chunk embeddings are NOT cached — they are stored directly in Qdrant during document processing and never regenerated unless the document is reprocessed.

## Error Handling

| Error | Strategy |
|-------|----------|
| Provider timeout | Retry 3x with exponential backoff (1s, 2s, 4s) |
| Rate limit (429) | Wait for `Retry-After` header, then retry |
| Model not found | Log error, fail document processing |
| Dimension mismatch | Log error, skip chunk (prevent Qdrant corruption) |
| Qdrant unavailable | Retry 2x, then fail (document status → FAILED) |

## Monitoring

Key metrics exported to Prometheus:

```
embedding_requests_total{provider, model, status}
embedding_duration_seconds{provider, model}
embedding_tokens_total{provider, model}
embedding_batch_size{provider}
embedding_cache_hits_total
embedding_cache_misses_total
```