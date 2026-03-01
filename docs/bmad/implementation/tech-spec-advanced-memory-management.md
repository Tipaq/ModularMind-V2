---
title: 'Advanced Memory Management System'
slug: 'advanced-memory-management'
created: '2026-03-01'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Python 3.12 / FastAPI
  - SQLAlchemy (async) + PostgreSQL
  - Qdrant (hybrid dense + BM25)
  - Redis Streams (event bus)
  - APScheduler (consolidation cron)
  - React + Zustand + shadcn/ui (Ops page)
  - '@modularmind/api-client'
files_to_modify:
  - engine/server/src/memory/models.py
  - engine/server/src/memory/interfaces.py
  - engine/server/src/memory/repository.py
  - engine/server/src/memory/manager.py
  - engine/server/src/memory/vector_store.py
  - engine/server/src/memory/fact_extractor.py
  - engine/server/src/memory/router.py
  - engine/server/src/memory/consolidator.py (new)
  - engine/server/src/memory/scorer.py (new)
  - engine/server/src/memory/graph_builder.py (new)
  - engine/server/src/pipeline/handlers/extractor.py
  - engine/server/src/pipeline/handlers/embedder.py
  - engine/server/src/pipeline/handlers/scorer.py (new)
  - engine/server/src/worker/scheduler.py
  - engine/server/src/worker/runner.py
  - engine/server/src/infra/config.py
  - engine/server/src/infra/publish.py
  - apps/ops/src/App.tsx
  - apps/ops/src/components/Sidebar.tsx
  - apps/ops/src/pages/Memory.tsx (new)
  - apps/ops/src/stores/memory.ts (new)
  - apps/ops/src/components/memory/ (new dir)
  - apps/ops/src/components/memory/MemoryGraph.tsx (new)
code_patterns:
  - Redis Streams pipeline (memory:raw -> memory:extracted -> [memory:scored if scorer enabled] -> embedder writes PG+Qdrant)
  - Zustand store + useApi hook for data fetching
  - ResourceTable + ResourceFilters for list views
  - PageHeader with gradient for page layout
  - MemoryRepository pattern (PG + Qdrant dual write)
  - APScheduler cron jobs for background consolidation
test_patterns:
  - pytest + pytest-asyncio for async tests
  - SQLAlchemy async session mocking
  - Qdrant client mocking
---

# Tech-Spec: Advanced Memory Management System

**Created:** 2026-03-01

## Overview

### Problem Statement

The current memory system stores all memories as flat `MemoryEntry` records with no distinction between episodic events, semantic facts, and procedural knowledge. Scoring is static (LLM confidence at extraction time), decay is linear and crude (-2% every 6h for entries unaccessed in 90 days), and consolidation only does decay + prune without merging, summarizing, or promoting memories. There is no Scorer step in the pipeline, no way to visualize or manage memories in the Ops console, and no mechanism to handle shared vs user-scoped knowledge interconnection.

### Solution

Implement a best-practices memory management system inspired by Mem0, Zep/Graphiti, LangMem, and Stanford Generative Agents research. This includes:

1. **Memory types** (episodic, semantic, procedural) with different lifecycle policies
2. **Multi-factor scoring** (recency + importance + relevance + frequency) following the Stanford formula
3. **Exponential decay** with type-specific half-lives and access-based reinforcement
4. **Scorer pipeline step** (LLM-driven scoring + type classification between extraction and embedding)
5. **Advanced consolidation** (LLM-driven ADD/UPDATE/DELETE/NOOP pattern from Mem0, episodic-to-semantic promotion, temporal invalidation instead of hard deletion)
6. **Ops Memory page** with visualization of memories, stats, shared vs user knowledge, and manual management

### Scope

**In Scope:**

- `MemoryType` enum (episodic, semantic, procedural) added to model
- Exponential decay with type-specific half-lives replacing linear decay
- Multi-factor retrieval scoring (Stanford formula)
- Scorer pipeline handler (`memory:extracted` -> `memory:scored` -> Embedder)
- LLM-driven consolidation (merge/update/invalidate) replacing simple decay+prune
- Temporal invalidation (`expired_at` field) instead of hard deletion
- Episodic-to-semantic promotion during consolidation
- Access-based reinforcement (recall strengthens memory)
- Ops Memory page with 4 tabs: Overview (KPI cards), Explorer (filterable table with user/scope/type dropdowns), Graph (Obsidian-style force-directed visualization via Sigma.js + Graphology), Consolidation (logs + stats)
- Memory graph edges computed from metadata correlation (shared entities, same category, same scope) with semantic similarity fallback (cosine > 0.85 via Qdrant)
- Graph edge pre-computation during consolidation, stored in `memory_edges` table
- API endpoints for memory management, stats by type, consolidation history, and graph data
- Alembic migration for new columns and tables

**Out of Scope:**

- Full knowledge graph database (Neo4j/Memgraph) -- future phase. Graph is computed from existing Qdrant + PG data, not a separate graph DB.
- Multi-agent shared memory blocks (Letta-style) -- future phase
- Sleep-time compute agent -- future phase (current APScheduler cron is sufficient)
- Procedural memory self-modification (LangMem-style prompt evolution) -- future phase
- Cross-encoder reranker -- future phase (current RRF is sufficient)
- Community subgraph summarization (Zep tier 3) -- future phase
- Labeled relationship edges between entities (Zep-style triplets) -- future phase. Current graph uses correlation edges, not semantic relations.

## Context for Development

### Codebase Patterns

**Engine (Python):**
- Memory pipeline uses Redis Streams: `memory:raw` -> consumer group `extractors` -> `memory:extracted` -> consumer group `scorers` (if scorer enabled) -> `memory:scored` -> consumer group `embedders`. When scorer disabled: `memory:extracted` -> consumer group `embedders` directly
- `MemoryEntry` SQLAlchemy model in `memory/models.py` with `MemoryScope` and `MemoryTier` enums
- `MemoryRepository` handles PG + Qdrant dual write via `QdrantMemoryVectorStore`
- `FactExtractor` uses LLM to extract facts with `FactCategory` classification and entity extraction
- Consolidation runs as APScheduler cron job every 6h in `worker/scheduler.py`
- Deduplication uses hardcoded thresholds: semantic similarity >= 0.78, entity overlap >= 0.50
- `BaseHybridVectorStore` provides shared RRF hybrid search infrastructure

**Ops App (TypeScript):**
- React + React Router v7 with `DashboardLayout` wrapping all pages
- Pages use `PageHeader` (from `@modularmind/ui`) + content sections
- Complex pages use Zustand stores (see `stores/models.ts`), simple ones use `useApi` hook
- `ResourceTable` + `ResourceFilters` shared components for list views
- API calls via `api.get/post/patch/delete` from `lib/api.ts`
- Semantic color tokens only (no hardcoded Tailwind colors)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `engine/server/src/memory/models.py` | SQLAlchemy MemoryEntry model, MemoryScope/MemoryTier enums |
| `engine/server/src/memory/interfaces.py` | Pydantic schemas (MemoryEntrySchema, MemoryStats), IMemoryRepository protocol |
| `engine/server/src/memory/repository.py` | MemoryRepository: PG + Qdrant dual write, hybrid search, access tracking |
| `engine/server/src/memory/manager.py` | MemoryManager: high-level API for get_context, store_memory, format_context_for_prompt |
| `engine/server/src/memory/vector_store.py` | QdrantMemoryVectorStore: hybrid search, upsert, delete, scope-based filtering |
| `engine/server/src/memory/fact_extractor.py` | FactExtractor: LLM extraction, deduplication, FactCategory enum |
| `engine/server/src/memory/router.py` | FastAPI endpoints: list, get, search, stats, delete |
| `engine/server/src/pipeline/handlers/extractor.py` | extractor_handler: memory:raw -> memory:extracted |
| `engine/server/src/pipeline/handlers/embedder.py` | embedder_handler: memory:extracted -> PG + Qdrant |
| `engine/server/src/worker/scheduler.py` | APScheduler: memory_consolidation() cron job |
| `engine/server/src/worker/runner.py` | Worker process: Redis Streams consumers + scheduler |
| `engine/server/src/infra/config.py` | Settings: FACT_EXTRACTION_*, EMBEDDING_*, QDRANT_* |
| `engine/server/src/infra/publish.py` | Event publishing functions (enqueue_memory_raw) |
| `apps/ops/src/pages/Models.tsx` | Reference: complex page with Zustand store + filters + ResourceTable |
| `apps/ops/src/stores/models.ts` | Reference: Zustand store pattern |
| `apps/ops/src/components/Sidebar.tsx` | Navigation: add Memory entry here |
| `apps/ops/src/components/shared/ResourceTable.tsx` | Reusable table component |

### Technical Decisions

1. **MemoryType as model field, not separate tables**: Adding a `memory_type` column to `MemoryEntry` is simpler than separate tables and allows unified queries. The `MemoryType` enum (episodic, semantic, procedural) is orthogonal to `MemoryScope` (agent, user_profile, conversation, cross_conversation) and `MemoryTier` (buffer, summary, vector, archive).

2. **Scorer as pipeline step, not inline in extractor**: Adding a `memory:scored` stream between `memory:extracted` and the embedder follows the existing stream architecture and allows independent scaling. The Scorer uses a lightweight LLM (Haiku-class) to evaluate importance and classify type.

3. **LLM-driven consolidation (Mem0 pattern)**: Replacing threshold-based dedup with LLM ADD/UPDATE/DELETE/NOOP decisions improves precision by 22% (Mem0 benchmarks). The consolidation runs as a cron job, not real-time, to keep costs manageable.

4. **Exponential decay with half-lives (not linear)**: `importance *= 0.5 ** (days_since_access / half_life)` is more natural than `-0.02 per cycle`. Different half-lives per type: episodic=30d, semantic=365d, procedural=730d.

5. **Temporal invalidation (soft delete)**: Adding `expired_at` timestamp instead of hard-deleting contradicted memories preserves history and enables "what changed?" queries. Follows Zep's bi-temporal model (simplified: only `expired_at`, not full 4-timestamp model).

6. **Stanford retrieval formula**: `score = alpha * recency + beta * importance + gamma * relevance` with access-count frequency boost. Recency: `0.995 ^ hours_since_access`. Weights configurable via settings.

7. **Unified Explorer with dropdown filters (not separate tabs per scope)**: The Ops Memory page is an admin dashboard -- it shows ALL memories across all users. A user dropdown lets the admin filter by specific user. Separate "User Memories" and "Shared Knowledge" tabs don't make sense in an admin context; instead, a single Explorer tab with User + Scope + Type filters provides the same functionality more flexibly.

8. **Sigma.js + Graphology for graph visualization**: Sigma.js renders via WebGL, scaling to 10k+ nodes without performance issues (unlike D3/SVG which struggles above ~500 nodes). Graphology provides the graph data structure and algorithms (connected components, centrality, etc.).

9. **Graph edges via metadata correlation + semantic fallback**: Rather than computing O(n²) cosine similarity between all memory pairs, edges are built primarily from metadata matching (shared entities in the `entities` JSONB array, same `category`, same `scope`). Only for isolated nodes (no metadata matches), a Qdrant nearest-neighbor query finds semantic neighbors (cosine > 0.85) as fallback. This is both faster and produces more interpretable graphs.

10. **Graph edge pre-computation**: Edges are computed during the consolidation cron job (every 6h) and stored in a `memory_edges` table. The graph API serves pre-computed data instantly. When the admin clicks a specific node, an on-demand Qdrant query refreshes its connections for real-time accuracy.

## Implementation Plan

### Tasks

#### Phase 1: Data Model Evolution

- [ ] Task 1: Add MemoryType enum and new columns to MemoryEntry model
  - File: `engine/server/src/memory/models.py`
  - Action: Add `MemoryType` enum (EPISODIC, SEMANTIC, PROCEDURAL). Add columns to `MemoryEntry`: `memory_type` (MemoryType, default EPISODIC), `expired_at` (datetime, nullable), `last_scored_at` (datetime, nullable). Add index on `memory_type`. Also rename the existing column alias `meta` to `metadata` directly (i.e., change the Python attribute name from `meta` to `metadata` to match the DB column name `metadata` and eliminate the alias confusion). In `repository.py`, change the constructor keyword `meta=metadata or {}` to `metadata=metadata or {}` (line 51). **Important**: this rename applies ONLY to the `MemoryEntry` model. Other models (`ConversationMessage`, `RAGCollection`, etc.) also have a `meta` attribute — do NOT rename those. Verify with a scoped grep: `grep -rn 'MemoryEntry.*\.meta\b\|entry\.meta\b' engine/server/src/memory/` to find remaining usages within the memory module only.
  - Notes: `expired_at` enables temporal invalidation. `memory_type` drives decay half-life selection. Removing the `meta`/`metadata` alias prevents serialization bugs with `model_validate(from_attributes=True)`. The `decay_rate` column is NOT needed -- half-life is fully determined by `memory_type` + config constants.

- [ ] Task 2: Update Pydantic schemas and fix IMemoryRepository protocol
  - File: `engine/server/src/memory/interfaces.py`
  - Action: Add `memory_type: MemoryType` and `expired_at: datetime | None` to `MemoryEntrySchema`. Add `entries_by_type: dict[str, int]` to `MemoryStats`. **Fix existing protocol divergence**: change `IMemoryRepository` return types from `MemoryEntrySchema` to `MemoryEntry` to match the actual `MemoryRepository` implementation (which returns SQLAlchemy models, not Pydantic schemas). Add new method signatures: `invalidate_entry(entry_id) -> None`, `get_entries_for_consolidation(scope, scope_id, limit, older_than) -> list[MemoryEntry]`, `get_distinct_scopes() -> list[tuple[MemoryScope, str]]`.
  - Notes: Keep backward compat -- `memory_type` defaults to EPISODIC. The protocol fix is a pre-requisite to avoid compounding type divergence with new methods.

- [ ] Task 3: Create Alembic migration
  - File: `engine/server/alembic/versions/xxxx_add_memory_type_and_temporal.py` (new)
  - Action: Generate migration adding `memory_type` VARCHAR with default 'episodic', `expired_at` TIMESTAMP nullable, `last_scored_at` TIMESTAMP nullable to `memory_entries` table. Add index on `memory_type`. Backfill existing records with the following rules (in order):
    1. Set `memory_type='semantic'` for entries with scope='user_profile' and `metadata->>'category'` in ('preference', 'personal_info', 'context'). Note: `category` is inside the JSONB `metadata` column — use PostgreSQL JSONB text extraction (`->>`) in the SQL.
    2. Set `memory_type='semantic'` for entries with scope in ('agent', 'cross_conversation') — shared knowledge across agents/conversations is inherently semantic, not episodic.
    3. All remaining entries: set `memory_type='episodic'` (default).
  - Notes: Backfill is critical to classify existing data correctly. Note: `decay_rate` column is NOT added — half-life is fully determined by `memory_type` + config constants. The backfill should be tested on a staging DB first due to scope-based classification rules.

- [ ] Task 4: Update MemoryRepository for new fields
  - File: `engine/server/src/memory/repository.py`
  - Action: Update `create_entry` to accept `memory_type` param. Add `invalidate_entry(entry_id)` method that sets `expired_at=now()` instead of deleting. Update `search_hybrid` to filter out expired entries (`expired_at IS NULL`). Add `get_entries_for_consolidation()` that returns entries grouped by scope for the consolidator. Update `get_stats` to include `entries_by_type` counts.
  - Notes: All queries must now exclude expired entries by default.

- [ ] Task 5: Update Qdrant vector store payload
  - File: `engine/server/src/memory/vector_store.py`
  - Action: Add `memory_type` to Qdrant point payload in `upsert_entry`. Add a boolean `is_expired` field to the payload (set to `false` on upsert). Update `search` to add a filter condition: `is_expired` must equal `false`. When a memory is invalidated, update the Qdrant payload to set `is_expired=true` (add `invalidate_entry(entry_id)` method that updates the point payload). Update `MemorySearchResult` dataclass to include `memory_type`.
  - Notes: Using a boolean `is_expired` field instead of a nullable `expired_at` timestamp avoids the complexity of Qdrant's `IsNull` condition (which requires creating a dedicated field index with `is_null=true` parameter). A simple `FieldCondition(key="is_expired", match=MatchValue(value=False))` is straightforward and well-supported.

#### Phase 1b: Pipeline user_id Propagation (Pre-requisite)

- [ ] Task 5b: Propagate user_id through the entire memory pipeline
  - File: `engine/server/src/infra/publish.py`
  - Action: Add `user_id: str` parameter to `enqueue_memory_raw()`. Include `"user_id": user_id` in the published payload. Update all callsites of `enqueue_memory_raw` (e.g., in supervisor/service.py, conversations/router.py, or wherever memory extraction is triggered) to pass the authenticated user's ID.
  - File: `engine/server/src/pipeline/handlers/extractor.py`
  - Action: Read `user_id = data.get("user_id", "")` from the incoming payload. Pass it to `FactExtractor.extract_facts()` instead of hardcoded `user_id=""`. Include `user_id` in the payload published to `memory:extracted`.
  - File: `engine/server/src/pipeline/handlers/scorer.py` (when created)
  - Action: Read `user_id` from incoming payload and forward it in the `memory:scored` payload.
  - File: `engine/server/src/pipeline/handlers/embedder.py`
  - Action: Read `user_id` from incoming payload (currently not present). Pass it to `repo.create_entry()` so that memory entries are associated with the correct user. Use `user_id` for Qdrant payload `user_id` field.
  - Notes: **Critical fix**: Without user_id propagation, all memory entries are stored without user association. The Qdrant `search()` method already filters by `user_id`, so entries stored without user_id would be invisible to search. This task must be completed before or alongside Phase 2 tasks. **Important**: As of the current codebase, `enqueue_memory_raw` is defined but has NO callsites — it was never wired. This task must also identify where conversations complete (likely in `supervisor/service.py` after graph execution, or `conversations/router.py` when a conversation ends) and add the call to `enqueue_memory_raw` with the authenticated user's ID.

#### Phase 2: Scorer Pipeline Step

- [ ] Task 6: Create Scorer module
  - File: `engine/server/src/memory/scorer.py` (new)
  - Action: Create `MemoryScorer` class with method `score_facts(facts: list[dict]) -> list[dict]`. The scorer calls a lightweight LLM (configurable via `MEMORY_SCORER_MODEL` setting) with a prompt that evaluates each fact and returns: `importance` (0-1 refined score), `memory_type` (episodic/semantic/procedural classification), `salience` (how inherently important this fact is). The prompt includes criteria: temporal specificity (dated events = episodic), generalized knowledge (preferences, skills = semantic), how-to knowledge (procedures, workflows = procedural). Filter out facts with importance < 0.2.
  - Notes: Prompt design is critical. Use structured JSON output. The scorer adds ~200ms latency but saves embedding costs by filtering low-value facts.

- [ ] Task 7: Create Scorer pipeline handler
  - File: `engine/server/src/pipeline/handlers/scorer.py` (new)
  - Action: Create `scorer_handler(data: dict) -> None`. Reads from `memory:extracted` stream (via `scorers` consumer group). Parses facts from payload, calls `MemoryScorer.score_facts()`, filters low-importance results, publishes enriched facts (with `memory_type` and refined `importance`) to `memory:scored` stream. Payload format: same as extractor output + `memory_type` and `scored_importance` fields.
  - Notes: Pipeline flow: extractor publishes to `memory:extracted` → scorer consumes via `scorers` group → scorer publishes to `memory:scored` → embedder consumes via `embedders` group. The scorer sits between extractor and embedder.

- [ ] Task 8: Update pipeline wiring (with scorer bypass)
  - File: `engine/server/src/worker/runner.py`
  - Action: **Conditional wiring based on `MEMORY_SCORER_ENABLED` setting**:
    - If `MEMORY_SCORER_ENABLED=true` (default): subscribe scorer to `memory:extracted` (group="scorers", handler=scorer_handler), subscribe embedder to `memory:scored` (group="embedders", handler=embedder_handler). Flow: extractor → memory:extracted → scorer → memory:scored → embedder.
    - If `MEMORY_SCORER_ENABLED=false`: subscribe embedder directly to `memory:extracted` (group="embedders", handler=embedder_handler), skip scorer entirely. Flow: extractor → memory:extracted → embedder.
    This is a **startup-time decision** based on settings, not a per-message check. Add stream name constants.
  - File: `engine/server/src/pipeline/handlers/extractor.py`
  - Action: No change needed -- extractor always publishes to `memory:extracted`.
  - File: `engine/server/src/pipeline/handlers/embedder.py`
  - Action: Accept input from either `memory:scored` or `memory:extracted` (payload format is compatible). Parse `memory_type` from payload if present (default to EPISODIC if missing — this handles the bypass case). Use `scored_importance` if present, otherwise fall back to raw `importance`. **Also fix existing bug**: add `base_url=settings.OLLAMA_BASE_URL` to the `get_embedding_provider()` call (currently missing, but present in `router.py` — needed for Ollama provider to work correctly).
  - File: `engine/server/src/infra/publish.py`
  - Action: Add `enqueue_memory_scored()` publish function for the scorer handler.
  - Notes: The bypass ensures zero latency/cost impact when scoring is disabled. The embedder is resilient to both payload formats.

- [ ] Task 9: Add scorer config settings
  - File: `engine/server/src/infra/config.py`
  - Action: Add settings: `MEMORY_SCORER_MODEL: str = ""` (empty = use DEFAULT_LLM_PROVIDER), `MEMORY_SCORER_ENABLED: bool = True`, `MEMORY_SCORER_MIN_IMPORTANCE: float = 0.2`.
  - Notes: When scorer is disabled, pipeline falls back to direct extractor->embedder flow.

#### Phase 3: Exponential Decay & Multi-Factor Scoring

- [ ] Task 10: Create exponential decay utility function
  - File: `engine/server/src/memory/consolidator.py` (new — will also contain consolidator class in Task 13)
  - Action: Create a standalone `apply_exponential_decay(session, settings)` async function that Task 14 will call. This function: (1) queries all active entries (`expired_at IS NULL`), (2) applies exponential decay per memory type: `days_since_access = (now - COALESCE(last_accessed, created_at)).days` (use `created_at` as fallback for entries never accessed, since `last_accessed` is nullable), then `new_importance = importance * (0.5 ** (days_since_access / half_life))`, with half-lives: episodic=30d, semantic=365d, procedural=730d, (3) invalidates entries below threshold (sets `expired_at=now()` in PG, sets `is_expired=true` in Qdrant via best-effort update) instead of hard deleting, (4) returns count of decayed and invalidated entries. Add constants to settings: `MEMORY_DECAY_EPISODIC_HALF_LIFE`, `MEMORY_DECAY_SEMANTIC_HALF_LIFE`, `MEMORY_DECAY_PROCEDURAL_HALF_LIFE`, `MEMORY_DECAY_PRUNE_THRESHOLD: float = 0.05`.
  - Notes: This is a standalone utility function, NOT a replacement of `memory_consolidation()`. Task 14 calls this function as step 1 of the full consolidation cycle. The prune threshold is lowered from the current 0.1 to 0.05 because temporal invalidation (soft-delete) is reversible, unlike hard-delete. **Deployment order**: The Alembic migration (Task 3) that adds `expired_at` MUST be applied before deploying this code. **Qdrant sync**: When invalidating, update Qdrant payload to set `is_expired=true` (matching Task 5's boolean field design). Use best-effort Qdrant update (log + continue on failure).

- [ ] Task 11: Implement multi-factor retrieval scoring
  - File: `engine/server/src/memory/manager.py`
  - Action: Update `get_context()` to apply Stanford-style multi-factor scoring after hybrid search. For each result `(entry, qdrant_score)`: compute `recency = 0.995 ** hours_since_access`, `frequency = min(1.0, log(1 + access_count) / log(1 + 50))`, `relevance = qdrant_score` (already 0-1 from RRF), `importance = entry.importance`. Final score: `alpha * recency + beta * importance + gamma * relevance + delta * frequency`. Default weights: `alpha=0.15, beta=0.25, gamma=0.45, delta=0.15`. Re-sort results by final score and return top-K. Add weight constants to settings: `MEMORY_SCORE_WEIGHT_RECENCY`, etc.
  - Notes: Relevance (gamma=0.45) is dominant -- semantic match matters most. Importance (beta=0.25) ensures critical facts surface. Recency and frequency are tiebreakers. **Also update type annotations**: change `MemoryManager.get_context()` return type from `list[MemoryEntrySchema]` to `list[MemoryEntry]` to match the Task 2 protocol fix (the repository returns SQLAlchemy models, not Pydantic schemas). Update `store_memory` and `extract_memory_from_response` signatures similarly.

- [ ] Task 12: Add access reinforcement (diminishing returns)
  - File: `engine/server/src/memory/repository.py`
  - Action: Update `update_access()` to also apply a diminishing importance boost: `boost = 0.01 / (1 + log(1 + access_count))`, then `importance = min(1.0, importance + boost)`. This prevents a positive feedback loop where frequently accessed memories always dominate retrieval. First access gives +0.01, 10th access gives ~+0.004, 50th access gives ~+0.003. Cap at 1.0.
  - Notes: Combined with `last_accessed` reset, this creates a natural retention curve. The diminishing formula ensures that memories don't accumulate unbounded importance from frequent access — they need genuine importance (via scorer) to rank highly. Import `math.log` for the formula.

#### Phase 4: Advanced Consolidation

- [ ] Task 13: Create Consolidator module
  - File: `engine/server/src/memory/consolidator.py` (new)
  - Action: Create `MemoryConsolidator` class with methods:
    - `consolidate_scope(scope, scope_id)`: Main consolidation loop for a scope. Retrieves active (non-expired) entries (max 50 per scope per cycle). Groups by similarity clusters using **per-entry Qdrant nearest-neighbor queries** (with `is_expired=false` filter to exclude entries just invalidated by the decay step) + **union-find** (NOT O(n²) full pairwise comparison): for each entry, query Qdrant for neighbors with cosine > 0.85 (limit=5), then use union-find to merge overlapping neighbor sets into clusters. For each cluster with >= 2 entries, calls `evaluate_cluster()`.
    - `evaluate_cluster(entries)`: Calls LLM with the cluster of similar memories and asks for one of: `MERGE` (combine into single entry with best content), `KEEP` (all are distinct enough), `INVALIDATE` (mark stale entries as expired). Returns list of operations.
    - `promote_episodic_to_semantic(scope, scope_id)`: Finds episodic memories with `access_count >= 3` and `importance >= 0.6` that are at least 7 days old. Calls LLM to generalize the episodic fact into a semantic statement. Creates new semantic entry, invalidates original episodic entry.
    - `execute_operations(operations)`: Applies merge/invalidate/promote operations to PG + Qdrant (soft-delete originals via `expired_at`, create merged entry if MERGE).
  - Notes: Follows Mem0's ADD/UPDATE/DELETE/NOOP pattern adapted for batch consolidation. The LLM prompt is critical -- it must understand that MERGE means combining redundant facts, not losing information. **Clustering complexity**: O(n * k) where k=5 (Qdrant neighbors per entry), NOT O(n²). Union-find provides near-O(n) grouping with path compression.

- [ ] Task 14: Wire consolidator into scheduler
  - File: `engine/server/src/worker/scheduler.py`
  - Action: Replace the body of `memory_consolidation()` with: (0) **Acquire Redis lock** (`SETNX memory:consolidation:lock` with TTL=30min) — if lock is held, log a warning and skip this cycle gracefully. (1) Call `apply_exponential_decay(session, settings)` from Task 10. (2) Enumerate active scopes via `repo.get_distinct_scopes()` (returns list of (scope, scope_id) tuples from `SELECT DISTINCT scope, scope_id FROM memory_entries WHERE expired_at IS NULL`). (3) For each scope (limited to **max 20 scopes per cycle** to bound LLM cost — remaining scopes processed in next cycle using a round-robin cursor stored in Redis), call `MemoryConsolidator.consolidate_scope()` (max 50 entries per scope). (4) Call `MemoryConsolidator.promote_episodic_to_semantic()` for user_profile scopes. (5) Log consolidation stats (merged, invalidated, promoted counts) to `ConsolidationLog`.
  - Notes: **LLM cost estimate**: With max 20 scopes × 50 entries per scope = 1000 entries max per cycle. Each cluster evaluation is ~500 input tokens + ~100 output tokens. Assuming ~50 clusters per cycle: ~$0.05/cycle with Haiku-class model. At 4 cycles/day: **~$0.20/day** for consolidation LLM costs. Scoring LLM costs (per-message): ~$0.30/day at moderate traffic (500 messages/day). **Total estimated: ~$0.50/day**.

- [ ] Task 15: Add consolidation logging
  - File: `engine/server/src/memory/models.py`
  - Action: Add `ConsolidationLog` SQLAlchemy model with fields: `id`, `scope`, `scope_id`, `action` (merge/invalidate/promote/decay/manual_invalidate), `source_entry_ids` (JSONB list), `result_entry_id` (nullable), `details` (JSONB), `created_at`. Add index on `created_at` for efficient pagination and cleanup queries. This provides audit trail for the Ops page.
  - Notes: Table name: `memory_consolidation_logs`. Keep last 30 days of logs. **Cleanup**: Add a step at the end of `memory_consolidation()` that deletes `ConsolidationLog` entries older than 30 days: `DELETE FROM memory_consolidation_logs WHERE created_at < NOW() - INTERVAL '30 days'`. The index on `created_at` ensures this is efficient.

#### Phase 5: Graph Edge Computation & API

- [ ] Task 16: Create MemoryEdge model and graph builder
  - File: `engine/server/src/memory/models.py`
  - Action: Add `EdgeType` Python enum (ENTITY_OVERLAP, SAME_CATEGORY, SEMANTIC_SIMILARITY). Add `MemoryEdge` SQLAlchemy model with fields: `id` (VARCHAR(36), default=str(uuid4()), consistent with MemoryEntry.id), `source_id` (VARCHAR(36), FK -> memory_entries.id), `target_id` (VARCHAR(36), FK -> memory_entries.id), `edge_type` (SQLAlchemy `Enum(EdgeType)` — creates PostgreSQL enum type, consistent with MemoryScope/MemoryTier patterns), `weight` (float 0-1, strength of connection), `shared_entities` (JSONB list, the entities both memories share), `created_at`. Add composite unique constraint on (source_id, target_id). Table name: `memory_edges`.
  - Notes: Edges are directional but stored once (source_id < target_id alphabetically to avoid duplicates). Weight represents connection strength: entity overlap count / max entities for ENTITY_OVERLAP, cosine score for SEMANTIC_SIMILARITY, 1.0 for SAME_CATEGORY/SAME_SCOPE.

- [ ] Task 17: Create graph builder service
  - File: `engine/server/src/memory/graph_builder.py` (new)
  - Action: Create `MemoryGraphBuilder` class with methods:
    - `build_edges(scope=None, scope_id=None)`: Main method. Loads all active (non-expired) memories (hard cap: 500 per scope). Builds an **inverted index** `entity -> set[entry_id]` in a single O(n) pass over all entries. Then iterates over the inverted index to find entries sharing entities — this avoids O(n²) pairwise comparison:
      1. **Entity overlap** (via inverted index): For each entity in the index, create edges between all entries sharing that entity. Edge type=ENTITY_OVERLAP, weight = shared_count / max(len_a, len_b), shared_entities = intersection list. Deduplicate edges by (source_id, target_id) pair.
      2. **Same category**: For entries with same `metadata.category` AND same scope AND no entity overlap edge already, create edge with type=SAME_CATEGORY, weight=0.5.
      3. **Semantic fallback**: For memories with no metadata edges (isolated nodes), query Qdrant for top-3 nearest neighbors (cosine > 0.85). Create edge with type=SEMANTIC_SIMILARITY, weight=cosine_score.
    - `rebuild_all()`: Drop all edges, rebuild from scratch. Called on first run or manual reset.
    - `incremental_update(entry_ids)`: Only recompute edges for specific entries (called after new memories are stored).
  - Notes: **Complexity**: Inverted index build is O(n * avg_entities). Edge creation from index is O(sum of entity co-occurrence pairs), which is typically << O(n²) for sparse entity distributions. Semantic fallback only applies to isolated nodes, keeping Qdrant query count low. Hard cap of 500 nodes per scope prevents memory issues; if a scope exceeds 500 entries, only the 500 highest-importance entries are included.

- [ ] Task 18: Wire graph builder into consolidation
  - File: `engine/server/src/worker/scheduler.py`
  - Action: After consolidation (decay + merge + promote), call `MemoryGraphBuilder.build_edges()` to refresh the graph. Log edge count in consolidation stats.
  - Notes: Graph rebuild runs after consolidation because merges/invalidations change the node set.

- [ ] Task 19: Extend memory API endpoints
  - File: `engine/server/src/memory/router.py`
  - Action: Update `MemoryEntryResponse` to include new fields: `memory_type: MemoryType`, `expired_at: datetime | None`, `metadata: dict` (the JSONB metadata field), `user_id: str | None`. **Add admin role checks**: all new admin-specific endpoints (invalidate, promote, explore, graph, stats/global, consolidation logs, users list) require `RequireAdmin` dependency from `src.auth` (usage: `_: None = RequireAdmin` as endpoint parameter). Note: existing memory endpoints (list, get, search, stats, delete) remain user-accessible via `CurrentUser` — only new admin endpoints get `RequireAdmin`. Update existing endpoints to include `memory_type` and `expired_at` in responses. Refactor the `list_memories` endpoint to use `MemoryEntryResponse.model_validate(e)` instead of manual field-by-field construction (consistent with `get_memory` which already does this at line 145), so that new fields (`memory_type`, `expired_at`, `metadata`, `user_id`) are automatically included. Add new endpoints:
    - `GET /memory/stats/global` -- aggregate stats across all scopes: total by type (episodic/semantic/procedural), by tier (buffer/summary/vector/archive), by scope (agent/user_profile/conversation/cross_conversation), average importance per type, total access count, last consolidation run time, entries decayed/invalidated in last cycle.
    - `GET /memory/consolidation/logs?page=1&page_size=20` -- paginated consolidation history from `memory_consolidation_logs` table.
    - `POST /memory/{entry_id}/invalidate` -- manually invalidate (soft-delete) a memory entry: sets `expired_at=now()`, creates a consolidation log entry with action="manual_invalidate".
    - `POST /memory/{entry_id}/promote` -- manually promote episodic to semantic: calls consolidator's promote logic, creates consolidation log entry.
    - `GET /memory/explore?user_id=X&scope=Y&memory_type=Z&tier=W&page=1&page_size=20&include_expired=false` -- unified explorer endpoint (replaces `list_memories` for admin use — the existing `list_memories` has a bug where total count ignores the `tier` filter). Includes its own `count_entries()` query that respects all active filters for accurate pagination. All filters optional. Returns paginated list with full metadata. When `user_id` is provided, filters by user. When `scope` is provided, filters by scope. When `memory_type` is provided, filters by type. Default: all memories, expired excluded.
    - `GET /memory/graph?scope=X&scope_id=Y&user_id=Z&memory_type=W&limit=500&edge_limit=2000` -- returns graph data for visualization. Response: `{ nodes: [{ id, content, memory_type, scope, importance, access_count, entities, created_at }], edges: [{ source, target, edge_type, weight, shared_entities }] }`. Filters narrow the graph. `limit` caps node count (default 500, max 1000). `edge_limit` caps edge count (default 2000, max 5000) — edges are returned sorted by weight descending so the strongest connections are always included.
    - `GET /memory/graph/node/{entry_id}/neighbors` -- on-demand refresh: queries Qdrant for real-time nearest neighbors of a specific node. Returns fresh edges for that node. Used when admin clicks a node in the graph for live details.
    - `GET /memory/users` -- list all users that have memories (for the user dropdown filter). Returns `[{ user_id, display_name, memory_count }]`.
  - Notes: All list endpoints filter `expired_at IS NULL` by default, with optional `include_expired=true` param. The graph endpoint returns pre-computed edges from `memory_edges` table. The explore endpoint replaces separate user/shared endpoints.

- [ ] Task 20: Add Alembic migration for edges and consolidation_logs tables
  - File: `engine/server/alembic/versions/xxxx_add_memory_edges_and_consolidation_logs.py` (new)
  - Action: Create migration adding two tables:
    1. `memory_edges` table: `id` VARCHAR(36) PK (consistent with MemoryEntry.id type), `source_id` VARCHAR(36) FK -> memory_entries.id, `target_id` VARCHAR(36) FK -> memory_entries.id, `edge_type` (PostgreSQL enum: ENTITY_OVERLAP, SAME_CATEGORY, SEMANTIC_SIMILARITY), `weight` FLOAT, `shared_entities` JSONB, `created_at` TIMESTAMP. Indexes on `source_id`, `target_id`, composite unique (source_id, target_id).
    2. `memory_consolidation_logs` table: `id` VARCHAR(36) PK, `scope` VARCHAR(30), `scope_id` VARCHAR(100), `action` VARCHAR(30), `source_entry_ids` JSONB, `result_entry_id` VARCHAR(36) nullable, `details` JSONB, `created_at` TIMESTAMP. Index on `created_at` (for pagination and cleanup queries).
  - Notes: This migration depends on the Phase 1 migration (Task 3) having run first. Both `memory_edges.id` and `memory_consolidation_logs.id` use VARCHAR(36) to be consistent with `memory_entries.id` (which stores UUIDs as strings).

#### Phase 6: Ops Memory Page

- [ ] Task 21: Create memory Zustand store
  - File: `apps/ops/src/stores/memory.ts` (new)
  - Action: Create Zustand store following `stores/models.ts` pattern. State:
    - `globalStats: GlobalMemoryStats | null` -- KPI data from /memory/stats/global
    - `memories: MemoryEntry[]` -- current page of filtered memories
    - `memoryTotal: number` -- total count for pagination
    - `consolidationLogs: ConsolidationLog[]` -- current page of logs
    - `logsTotal: number` -- total log count
    - `graphData: { nodes: GraphNode[], edges: GraphEdge[] } | null` -- graph visualization data
    - `users: MemoryUser[]` -- list of users with memories (for dropdown)
    - `filters: { userId?: string, scope?: string, memoryType?: string, includeExpired: boolean }` -- current filter state
    - `loading: boolean`, `error: string | null`
    Actions:
    - `fetchGlobalStats()` -- GET /memory/stats/global
    - `fetchMemories(page, pageSize)` -- GET /memory/explore with current filters
    - `fetchConsolidationLogs(page, pageSize)` -- GET /memory/consolidation/logs
    - `fetchGraphData()` -- GET /memory/graph with current filters
    - `fetchNodeNeighbors(entryId)` -- GET /memory/graph/node/{id}/neighbors (merges into graphData)
    - `fetchUsers()` -- GET /memory/users
    - `setFilters(filters)` -- updates filter state, triggers refetch
    - `invalidateEntry(id)` -- POST /memory/{id}/invalidate, refetches
    - `promoteEntry(id)` -- POST /memory/{id}/promote, refetches
  - Notes: Use `api.get/post` from `lib/api.ts`. Types defined inline or in a separate `types/memory.ts`.

- [ ] Task 22: Create Memory page with 4 tabs
  - File: `apps/ops/src/pages/Memory.tsx` (new)
  - Action: Create page with `PageHeader` (icon: Brain from lucide-react, gradient: `from-info to-info/70`, title: "Memory Management", description: "Monitor and manage the agent memory system"). Use Tabs component from `@modularmind/ui` with 4 tabs:
    1. **Overview** -- renders `<MemoryOverviewTab />`
    2. **Explorer** -- renders `<MemoryExplorerTab />`
    3. **Graph** -- renders `<MemoryGraphTab />`
    4. **Consolidation** -- renders `<ConsolidationTab />`
  - On mount: call `fetchGlobalStats()` and `fetchUsers()` from store.
  - Notes: Each tab renders its component directly (not lazy-loaded, consistent with existing ops app pattern). Tab state persisted in URL search params (`?tab=graph`).

- [ ] Task 23: Create MemoryOverviewTab component
  - File: `apps/ops/src/components/memory/MemoryOverviewTab.tsx` (new)
  - Action: Stats cards grid (4 columns on desktop, 2 on mobile) showing:
    Row 1: Total Memories (number), Episodic (number + info badge), Semantic (number + primary badge), Procedural (number + warning badge).
    Row 2: Avg Importance (number with colored indicator), Total Accesses (number), Last Consolidation (relative timestamp), Entries Decayed (number from last cycle).
    Below cards: simple horizontal stacked bar showing type distribution (episodic vs semantic vs procedural as proportional segments, colored by type). Uses semantic tokens: `bg-info` for episodic, `bg-primary` for semantic, `bg-warning` for procedural.
  - Notes: Follow Dashboard.tsx metric card pattern. No external charting library -- use CSS/Tailwind for the stacked bar.

- [ ] Task 24: Create MemoryExplorerTab component
  - File: `apps/ops/src/components/memory/MemoryExplorerTab.tsx` (new)
  - Action: Filter row at top with 3 dropdowns + 1 toggle:
    - **User** dropdown: populated from `store.users`, shows "All Users" by default. Each option shows user name + memory count.
    - **Scope** dropdown: All / user_profile / agent / conversation / cross_conversation
    - **Type** dropdown: All / episodic / semantic / procedural
    - **Include expired** toggle: rendered as a standalone `Switch` component from `@modularmind/ui` (NOT inside `ResourceFilters`, which only supports search/select/sort types). Placed inline next to the dropdowns with a "Show expired" label.
    Changing any filter calls `store.setFilters()` which triggers `fetchMemories()`.
    Below filters: `ResourceTable` with columns:
    - Content (truncated to 120 chars, tooltip shows full)
    - Type (`MemoryTypeBadge` component: episodic=info, semantic=primary, procedural=warning)
    - Scope (badge with scope name)
    - Importance (colored progress bar: destructive < 0.3, warning 0.3-0.6, success > 0.6)
    - Access Count (number)
    - Last Accessed (relative timestamp or "Never")
    - Created (relative timestamp)
    - Actions: dropdown menu with "Invalidate" (for any entry) and "Promote to Semantic" (only for episodic entries)
    Pagination at bottom. Sorting on importance, access_count, created_at columns.
  - Notes: Use `ResourceFilters` for the User, Scope, and Type dropdown filters. Render the "Show expired" `Switch` separately outside `ResourceFilters` (it only supports search/select/sort types). Row actions use DropdownMenu from `@modularmind/ui`. Confirmation dialog before invalidate/promote.

- [ ] Task 25: Create MemoryGraphTab component (Sigma.js + Graphology)
  - File: `apps/ops/src/components/memory/MemoryGraphTab.tsx` (new)
  - Action: Full-width graph visualization using `@react-sigma/core` (React wrapper for Sigma.js) with `graphology` for graph data structure. Layout:
    - Left sidebar (240px): Filter controls (same User/Scope/Type dropdowns as Explorer). Legend showing node colors by type and edge colors by edge_type. Node count and edge count display.
    - Main area: Sigma.js canvas rendering the force-directed graph.
    Node rendering:
    - **Color by memory_type**: episodic = info token color, semantic = primary token color, procedural = warning token color.
    - **Size by importance**: min 4px (importance=0) to max 20px (importance=1). Formula: `4 + importance * 16`.
    - **Label**: first 40 chars of content, shown on hover.
    - **Border**: thicker border for high access_count (> 5 accesses).
    Edge rendering:
    - **Color by edge_type**: ENTITY_OVERLAP = solid primary, SAME_CATEGORY = dashed muted, SEMANTIC_SIMILARITY = dotted accent.
    - **Thickness by weight**: min 0.5px to max 3px.
    Interactions:
    - **Hover node**: highlight node + connected edges, show tooltip with full content, type, importance, entities, access_count.
    - **Click node**: call `store.fetchNodeNeighbors(id)` for real-time refresh. Show detail panel (right sidebar 300px) with: full content, all metadata, connected nodes list, action buttons (invalidate, promote).
    - **Zoom/Pan**: standard Sigma.js controls.
    - **Search**: text input in left sidebar to find and focus on a node by content match.
    On mount: call `store.fetchGraphData()` with current filters. Use ForceAtlas2 layout algorithm via `graphology-layout-forceatlas2` (a separate graphology plugin, NOT built into Sigma.js). For web worker support, use `graphology-layout-forceatlas2/worker` which provides a `FA2Layout` class that runs the simulation in a dedicated Web Worker.
  - Notes: Install `@react-sigma/core`, `sigma`, `graphology`, `graphology-layout-forceatlas2` as new dependencies in apps/ops. Sigma.js is the WebGL renderer (it does NOT include layout algorithms — it only renders). `graphology-layout-forceatlas2` provides the force-directed layout, and its `/worker` entry point runs the computation in a Web Worker to avoid blocking the UI thread. Limit to 500 nodes by default; show warning if more exist with option to increase.

- [ ] Task 26: Create ConsolidationTab component
  - File: `apps/ops/src/components/memory/ConsolidationTab.tsx` (new)
  - Action: Two sections:
    1. **Last Run Summary**: Card showing last consolidation timestamp, duration, counts (decayed, merged, invalidated, promoted, edges rebuilt). Uses same metric card pattern as Overview.
    2. **Consolidation History**: `ResourceTable` with columns:
      - Timestamp (formatted datetime)
      - Action (colored badge: merge=info, invalidate=destructive, promote=success, decay=warning, manual_invalidate=muted)
      - Scope (scope name)
      - Affected Entries (count)
      - Details (expandable: shows source entry IDs, result entry ID if merge/promote, description text)
    Pagination. Sort by timestamp desc (most recent first).
  - Notes: Expandable rows use a simple toggle div with React state-based visibility (the `Collapsible` shadcn/ui primitive is not currently installed in `@modularmind/ui` — if desired, run `npx shadcn@latest add collapsible` first, otherwise use a basic `{isOpen && <div>...</div>}` pattern).

- [ ] Task 27: Create shared memory sub-components
  - File: `apps/ops/src/components/memory/MemoryTypeBadge.tsx` (new)
  - Action: Badge component. Props: `type: "episodic" | "semantic" | "procedural"`. Renders: episodic = `<Badge variant="outline" className="border-info text-info">Episodic</Badge>`, semantic = `<Badge variant="outline" className="border-primary text-primary">Semantic</Badge>`, procedural = `<Badge variant="outline" className="border-warning text-warning">Procedural</Badge>`.
  - File: `apps/ops/src/components/memory/ImportanceBar.tsx` (new)
  - Action: Small horizontal progress bar. Props: `value: number` (0-1). Bar fill color: `bg-destructive` if < 0.3, `bg-warning` if 0.3-0.6, `bg-success` if > 0.6. Width = `${value * 100}%`. Shows numeric value on hover.
  - File: `apps/ops/src/components/memory/EdgeTypeBadge.tsx` (new)
  - Action: Badge for graph edges. entity_overlap = primary, same_category = muted, semantic_similarity = accent.

- [ ] Task 28: Add Memory page to routing and navigation
  - File: `apps/ops/src/App.tsx`
  - Action: Add route: `<Route path="/memory" element={<Memory />} />` inside DashboardLayout routes (leading slash for consistency with existing routes like `/monitoring`, `/models`, etc.). Use a **direct import** `import Memory from "./pages/Memory"` (matching existing ops app pattern — the ops app uses direct imports, not `React.lazy()`; there is no `<Suspense>` wrapper in the current routing).
  - File: `apps/ops/src/components/Sidebar.tsx`
  - Action: Add navigation item in the Platform section (after Models): `{ name: "Memory", to: "/memory", icon: Brain }`. Import `Brain` from `lucide-react`. Note: the sidebar `NavItem` interface uses `{ name, to, icon }` fields (not `label`/`path`). The sidebar uses relative paths (e.g., `/models`, `/settings`) because the Router uses `basename="/ops"`.

- [ ] Task 29: Install graph visualization dependencies
  - File: `apps/ops/package.json`
  - Action: Add dependencies: `sigma`, `graphology`, `graphology-layout-forceatlas2`, `@react-sigma/core`. Run `pnpm install` from monorepo root. **Verify latest stable versions at implementation time** (run `npm info <package> version` for each). As of spec writing: sigma ~3.x, graphology ~0.25.x, graphology-layout-forceatlas2 ~0.10.x, @react-sigma/core ~4.x — but these may have newer releases.
  - Notes: Sigma v3 is the WebGL renderer. graphology-layout-forceatlas2 provides the force-directed layout algorithm. @react-sigma/core provides React hooks/components. Total bundle addition: ~150KB gzipped. Always install the latest stable version, not a pinned version from the spec.

### Acceptance Criteria

#### Engine -- Scoring & Typing

- [ ] AC 1: Given a new fact is extracted, when the scorer pipeline processes it, then it receives a `memory_type` (episodic/semantic/procedural) and a refined `importance` score, and these are persisted in PG and Qdrant.

- [ ] AC 2: Given the scorer is disabled (`MEMORY_SCORER_ENABLED=false`), when a fact is extracted, then the pipeline falls back to direct extractor->embedder flow with default type=episodic and raw confidence as importance.

#### Engine -- Decay

- [ ] AC 3: Given a memory entry has not been accessed for 30 days and is episodic, when the consolidation job runs, then its importance is reduced following exponential decay with half-life=30 days (importance ~= original * 0.5).

- [ ] AC 4: Given a semantic memory entry has not been accessed for 30 days, when the consolidation job runs, then its importance is barely reduced (half-life=365 days, so importance ~= original * 0.97).

- [ ] AC 5: Given a procedural memory entry has not been accessed for 60 days, when the consolidation job runs, then its importance is reduced minimally (half-life=730 days, so importance ~= original * 0.945, computed as `0.5 ** (60/730)`).

#### Engine -- Retrieval Scoring

- [ ] AC 6: Given a memory entry is retrieved via get_context, when the retrieval results are ranked, then the final score uses the multi-factor formula: `alpha * recency + beta * importance + gamma * relevance + delta * frequency` with configurable weights.

- [ ] AC 7: Given a memory entry is accessed, when update_access is called, then `last_accessed` is updated, `access_count` is incremented, and `importance` gets a diminishing reinforcement boost: `+0.01 / (1 + log(1 + access_count))` (capped at 1.0). The boost decreases with each subsequent access to prevent feedback loops.

#### Engine -- Consolidation

- [ ] AC 8: Given two semantically similar memories exist (cosine > 0.85), when the consolidator runs, then it uses LLM to decide: MERGE (create merged entry, invalidate originals), KEEP (leave both), or INVALIDATE (expire the weaker one).

- [ ] AC 9: Given an episodic memory has access_count >= 3, importance >= 0.6, and is >= 7 days old, when promotion runs, then the consolidator creates a generalized semantic memory and invalidates the original episodic entry.

- [ ] AC 10: Given a memory is invalidated (contradicted, merged, or manually), when it is soft-deleted, then `expired_at` is set to the current timestamp and the entry is excluded from all search results and stats by default.

- [ ] AC 11: Given the consolidation job completes, when results are logged, then a `ConsolidationLog` entry is created for each action (decay/merge/invalidate/promote) with source entry IDs and details.

#### Engine -- Graph

- [ ] AC 12: Given two memories share at least 1 entity in their `metadata.entities` arrays, when the graph builder runs, then an edge of type ENTITY_OVERLAP is created between them with weight = shared_count / max(entities_a, entities_b).

- [ ] AC 13: Given a memory has no metadata-based edges (isolated node), when the graph builder runs, then it falls back to a Qdrant nearest-neighbor query (cosine > 0.85) and creates SEMANTIC_SIMILARITY edges for the top 3 neighbors.

- [ ] AC 14: Given the graph API is called with filters (user_id, scope, memory_type), when the response is returned, then it contains only nodes matching the filters and only edges where both source and target match the filters, with a max of 500 nodes.

#### Ops -- Overview Tab

- [ ] AC 15: Given a user navigates to /ops/memory, when the page loads, then they see 4 tabs (Overview, Explorer, Graph, Consolidation) and the Overview tab shows KPI cards: total memories, count by type (episodic/semantic/procedural), average importance, total accesses, last consolidation time, entries decayed in last cycle.

#### Ops -- Explorer Tab

- [ ] AC 16: Given the Explorer tab is active, when the admin selects a user from the User dropdown, then the table filters to show only that user's memories across all scopes.

- [ ] AC 17: Given the Explorer tab is active, when the admin selects scope=agent and type=semantic, then the table shows only semantic memories in the agent scope -- effectively showing shared knowledge.

- [ ] AC 18: Given the Explorer tab shows a memory entry, when the admin clicks "Invalidate" in the row actions, then a confirmation dialog appears, and upon confirmation the entry is soft-deleted and disappears from the table.

- [ ] AC 19: Given the Explorer tab shows an episodic memory, when the admin clicks "Promote to Semantic", then the entry is promoted and the table reflects the change (new semantic entry appears, old episodic is gone unless include_expired is on).

#### Ops -- Graph Tab

- [ ] AC 20: Given the Graph tab is active, when graph data loads, then a force-directed graph renders with nodes colored by memory_type (episodic=info, semantic=primary, procedural=warning) and sized by importance.

- [ ] AC 21: Given the graph is rendered, when the admin hovers a node, then a tooltip shows the memory content, type, importance, entities, and access count.

- [ ] AC 22: Given the graph is rendered, when the admin clicks a node, then a detail panel appears on the right showing full content, metadata, connected nodes list, and action buttons (invalidate, promote).

- [ ] AC 23: Given the graph is rendered, when the admin changes a filter (user/scope/type) in the left sidebar, then the graph re-fetches and re-renders with only matching nodes and edges.

#### Ops -- Consolidation Tab

- [ ] AC 24: Given the Consolidation tab is active, when logs are loaded, then it shows a table of recent consolidation actions with timestamp, action type (colored badge), scope, affected entry count, and expandable details.

## Additional Context

### Dependencies

**Python (no new packages):**
- All existing: SQLAlchemy, Qdrant, APScheduler, LangChain

**npm (new packages for graph visualization -- apps/ops only):**
- `sigma` -- WebGL graph renderer (~80KB gzipped). Verify latest stable version at implementation time.
- `graphology` -- graph data structure library (~15KB gzipped)
- `graphology-layout-forceatlas2` -- ForceAtlas2 layout algorithm (~20KB gzipped), provides `/worker` entry for Web Worker execution
- `@react-sigma/core` -- React hooks/components for Sigma.js (~10KB gzipped)

**Infrastructure:**
- Two Alembic migrations must run before new code is deployed: Task 3 (memory_type, expired_at columns) + Task 20 (memory_edges + memory_consolidation_logs tables)
- Qdrant collection schema is backward-compatible (new payload fields are additive)

### Testing Strategy

**Unit tests:**
- `test_memory_scorer.py`: Test scorer classification (episodic vs semantic vs procedural) with sample facts
- `test_memory_decay.py`: Test exponential decay formula produces correct importance values for each type
- `test_memory_consolidator.py`: Test merge, invalidate, and promote logic with mocked LLM responses
- `test_memory_scoring.py`: Test multi-factor retrieval scoring formula with known inputs
- `test_memory_graph_builder.py`: Test edge computation: entity overlap (shared entities -> edge), same category (-> edge), semantic fallback for isolated nodes

**Edge case / resilience tests:**
- `test_memory_qdrant_degradation.py`: Test that search returns PG-only results when Qdrant is unavailable (graceful degradation). Test that consolidation continues when Qdrant upsert fails for one entry. Test that graph builder skips semantic fallback when Qdrant is down.
- `test_memory_llm_failure.py`: Test that scorer handler logs error and passes facts through unscored when LLM call fails. Test that consolidator skips cluster evaluation on LLM timeout without crashing the entire cycle.
- `test_memory_empty_state.py`: Test that consolidation, graph builder, and overview stats handle zero entries gracefully (no division by zero, no empty list errors).
- `test_memory_concurrent_consolidation.py`: Test that two simultaneous consolidation runs don't corrupt data (idempotent invalidation, no duplicate merges). Use a Redis-based lock or timestamp guard.

**Integration tests:**
- `test_memory_pipeline.py`: Test full pipeline flow: raw -> extracted -> scored -> embedded with correct memory_type. Test scorer bypass when MEMORY_SCORER_ENABLED=false.
- `test_memory_consolidation.py`: Test consolidation job creates correct log entries, modifies entries, and rebuilds graph edges. Test round-robin scope cursor persists across cycles.
- `test_memory_api.py`: Test new endpoints: /explore, /graph, /stats/global, invalidate, promote. Test admin role enforcement returns 403 for non-admin users.

**Manual testing:**
- Verify Ops Memory page renders correctly with all 4 tabs (Overview, Explorer, Graph, Consolidation)
- Verify Explorer filtering by User dropdown, Scope, and Type works correctly
- Verify Graph tab renders force-directed graph with correct node colors/sizes, edge colors/thickness
- Verify Graph node hover shows tooltip, click shows detail panel with actions
- Verify Graph filters update the visualization in real-time
- Verify Consolidation log shows real events after a manual trigger
- Verify expired entries are hidden from Explorer and Graph by default, shown when include_expired is toggled

### Notes

- **LLM cost considerations**: The Scorer and Consolidator both make LLM calls. Use a lightweight model (Haiku-class) for scoring (runs per-extraction) and consolidation (runs every 6h). Estimated cost: ~$0.30/day for scoring (500 messages/day) + ~$0.20/day for consolidation (20 scopes × 50 entries × 4 cycles) = **~$0.50/day** for a moderate-traffic deployment. See Task 14 notes for detailed breakdown.
- **Migration safety**: The Alembic migrations add columns with defaults and a new table, so they are non-breaking. **Deployment order**: (1) Run Alembic migrations (Task 3 + Task 20), (2) Deploy new engine code, (3) Deploy new worker code. The `expired_at` column is nullable so old code continues to work during migration. The backfill query for `memory_type` should be tested on a staging DB first.
- **Concurrent consolidation safety**: Use a Redis-based lock (`SETNX memory:consolidation:lock` with TTL=30min) at the start of `memory_consolidation()` to prevent overlapping runs if a cycle takes longer than 6h.
- **Consolidation batching**: Process max 50 entries per scope per consolidation cycle to avoid LLM rate limits. If a scope has more, continue in the next cycle.
- **Graph performance**: Sigma.js WebGL renderer handles 10k+ nodes smoothly. The 500-node default limit is to keep the visualization readable, not a performance constraint. ForceAtlas2 layout runs in a web worker to avoid blocking the main thread.
- **Graph edge count control**: With entity-based edges, the graph stays sparse and interpretable (most memories share 0-3 entities). The semantic fallback only applies to isolated nodes, keeping Qdrant query count low.
- **Shared knowledge interconnection**: The Explorer tab with User+Scope+Type filters makes the interconnection between shared and user knowledge visible. Selecting a user shows their personal memories; selecting scope=agent shows shared knowledge; selecting both shows how a specific user's memories relate to shared knowledge. The Graph tab makes this spatial -- shared knowledge clusters appear as central hubs connected to multiple user nodes.
- **Research references**: Stanford Generative Agents (Park et al., 2023) for scoring formula, Mem0 (arXiv:2504.19413) for ADD/UPDATE/DELETE/NOOP consolidation, Zep/Graphiti (arXiv:2501.13956) for temporal invalidation, Dynamic Memory paper (arXiv:2404.00573) for recall-based reinforcement.
