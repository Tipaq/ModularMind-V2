# ModularMind v3.2.0 — Release Notes

**Release Date:** 2026-02-15
**Type:** Minor Release

## Highlights

This release introduces the Memory Graph Visualization, Semantic Chunking for RAG, and Multi-Provider Fallback chains. It also includes significant performance improvements to the SSE streaming pipeline.

## New Features

### Memory Graph Visualization
- Interactive graph view of memory relationships in the Ops console
- Nodes represent memory entries, edges represent relationships (entity overlap, semantic similarity, same category)
- Filter by scope, tier, and memory type
- Click on nodes to inspect memory content and metadata
- Export graph data as JSON for external analysis

### Semantic Chunking Strategy
- New chunking strategy for RAG document processing: `semantic`
- Groups sentences by embedding similarity rather than fixed token counts
- Produces topically coherent chunks that improve search relevance
- Configurable similarity threshold (default: 0.5) and max chunk size (512 tokens)
- Requires an embedding provider (Ollama or OpenAI)

### Multi-Provider Fallback Chains
- Configure ordered fallback lists for LLM providers
- Automatic failover on error, timeout, or rate limiting
- Configurable conditions per fallback (on_error, on_timeout, on_rate_limit)
- Dashboard showing fallback trigger rates and provider health
- Budget alerts when fallback to expensive providers occurs

### Secondary Accent Color Derivation
- Theme system now automatically derives secondary accent from primary
- Consistent color harmony across all UI components
- New ThemeCustomizer widget with real-time preview

## Improvements

- SSE streaming latency reduced by 35% (removed unnecessary buffering layer)
- RAG search now supports filtering by document metadata
- Memory consolidation runs 2x faster with batch embedding optimization
- Qdrant payload indexes added for `memory_type` field
- Worker graceful shutdown now drains Redis streams properly (60s timeout)
- API client auto-refresh now emits session expiry events
- Conversation list pagination improved (cursor-based instead of offset)

## Bug Fixes

- Fixed race condition in memory extraction pipeline causing duplicate entries
- Fixed SSE reconnection loop when server returns 401 (now redirects to login)
- Fixed Qdrant snapshot creation failing for collections > 1M vectors
- Fixed theme persistence not applying accent color on page reload
- Fixed document upload progress bar showing incorrect percentage
- Fixed memory search returning expired entries in some edge cases

## Breaking Changes

- `GET /memory/search` now requires `query` as a query parameter instead of request body
- Memory consolidation log format changed (added `details.similarity_score`)
- Minimum Qdrant version bumped to 1.8.0 (required for named vectors)

## Migration Guide

1. Update Qdrant to v1.8.0+ before deploying
2. Run `alembic upgrade head` for new database indexes
3. Update API client to v3.2.0: `pnpm update @modularmind/api-client`
4. If using custom memory search integration, update to use query params

## Known Issues

- Semantic chunking is slow for documents > 100 pages (optimization planned for v3.3)
- Memory graph visualization may be slow with > 5000 nodes (pagination planned)