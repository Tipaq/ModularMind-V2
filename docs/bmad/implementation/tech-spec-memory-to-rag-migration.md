---
title: 'Memory-to-RAG Pipeline Migration & User Profile Simplification'
slug: 'memory-to-rag-migration'
created: '2026-03-06'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Python 3.12 / FastAPI
  - Redis Streams (RedisStreamBus)
  - PostgreSQL (SQLAlchemy + Alembic)
  - Qdrant (hybrid dense + BM25 sparse)
  - React / TypeScript (Vite + shadcn/ui)
  - LangGraph (graph engine)
  - Sigma 3.0 + Graphology (graph visualization)
files_to_modify:
  # --- Phase 1: DB migrations ---
  - engine/server/src/auth/models.py
  - engine/server/src/conversations/models.py
  - engine/server/src/rag/models.py
  # --- Phase 2: User profile backend ---
  - engine/server/src/auth/service.py
  - engine/server/src/auth/router.py
  - engine/server/src/prompt_layers/context.py
  # --- Phase 3: Built-in tools ---
  - engine/server/src/graph_engine/builtin_tools.py
  - engine/server/src/graph_engine/compiler.py
  - engine/server/src/graph_engine/tool_loop.py
  - engine/server/src/executions/service.py
  # --- Phase 4: Auto-synthesis ---
  - engine/server/src/auth/profile_synthesizer.py
  - engine/server/src/worker/scheduler.py
  - engine/server/src/infra/config.py
  # --- Phase 5: RAG multi-stage ---
  - engine/server/src/rag/handlers/extractor.py
  - engine/server/src/rag/handlers/embedder.py
  - engine/server/src/rag/handlers/storer.py
  - engine/server/src/rag/processor.py
  - engine/server/src/worker/runner.py
  - engine/server/src/worker/tasks.py
  - engine/server/src/infra/redis_streams.py
  # --- Phase 6: RAG consolidation ---
  - engine/server/src/rag/consolidator.py
  - engine/server/src/rag/repository.py
  # --- Phase 7: Frontend preferences ---
  - packages/ui/src/components/insights/ConfigTab.tsx
  - packages/ui/src/lib/chat-config.ts
  - apps/chat/src/hooks/useChatConfig.ts
  # --- Phase 8: Knowledge UI ---
  - engine/server/src/rag/router.py
  - apps/ops/src/pages/Knowledge.tsx
  - apps/ops/src/stores/knowledge.ts
  - apps/ops/src/components/knowledge/KnowledgeOverviewTab.tsx
  - apps/ops/src/components/knowledge/KnowledgeExplorerTab.tsx
  - apps/ops/src/components/knowledge/KnowledgeGraphTab.tsx
  - packages/ui/src/components/insights/MemoryTab.tsx
  # --- Phase 9: Cleanup (all files with memory deps) ---
  - engine/server/src/memory/ (entire directory)
  - engine/server/src/pipeline/handlers/extractor.py
  - engine/server/src/pipeline/handlers/scorer.py
  - engine/server/src/pipeline/handlers/summarizer.py
  - engine/server/src/pipeline/handlers/embedder.py
  - engine/server/src/infra/publish.py
  - engine/server/src/infra/metrics.py
  - engine/server/src/conversations/router.py
  - engine/server/src/conversations/compaction.py
  - engine/server/src/conversations/indexer.py
  - engine/server/src/conversations/search.py
  - engine/server/src/conversations/schemas.py
  - engine/server/src/supervisor/service.py
  - engine/server/src/supervisor/prompts.py
  - engine/server/src/admin/user_router.py
  - engine/server/src/admin/schemas.py
  - engine/server/src/internal/pipelines.py
  - engine/server/src/embedding/resolver.py
  - engine/server/src/cli.py
  - engine/server/src/infra/config.py
  - engine/server/src/main.py
  - apps/ops/src/pages/Memory.tsx
  - apps/ops/src/stores/memory.ts
  - apps/ops/src/components/memory/ (entire directory)
  - apps/ops/src/App.tsx
  - engine/server/alembic/env.py
  - apps/chat/src/hooks/useChat.ts
  - apps/chat/src/hooks/useInsightsPanel.ts
  - packages/ui/src/types/chat.ts
  - packages/ui/src/lib/mappers.ts
code_patterns:
  - Redis Streams multi-stage pipeline (subscribe per consumer group, publish to next stream)
  - PipelineContext dataclass for inter-handler data parsing
  - MCP tool discovery + LangChain tool binding pattern (discover_and_convert -> try_bind_tools)
  - AgentContextBuilder with budget-based context injection as SystemMessages
  - ResourceTable + pagination + filter pattern for admin tables
  - Sigma/Graphology with ForceAtlas2 for graph visualization
  - Zustand stores for ops state management
test_patterns:
  - pytest with async fixtures (pytest-asyncio)
  - Alembic migrations for schema changes
---

# Tech-Spec: Memory-to-RAG Pipeline Migration & User Profile Simplification

**Created:** 2026-03-06

## Overview

### Problem Statement

The current memory pipeline (LLM fact extraction -> scoring -> embedding -> Qdrant) is over-engineered for its actual use case. Extracted conversation facts are unreliable, overlap with conversation history already injected into context, and don't provide clear cross-conversation value for short-conversation usage patterns. Meanwhile, the RAG pipeline lacks the multi-stage streaming architecture that the memory pipeline already has (single synchronous handler vs multi-stage Redis Streams).

### Solution

Replace the memory system with three simpler, purpose-built features:

1. **User Profile** — manual editing in chat UI + LLM `update_user_profile` tool + periodic auto-synthesis (cron-based LLM that merges new conversation facts into existing profile text)
2. **Conversation Search** — Claude-style `conversation_search` + `recent_conversations` tools given to the LLM, backed by PostgreSQL full-text search (tsvector)
3. **Enhanced RAG Pipeline** — inherit the memory pipeline's multi-stage Redis Streams architecture for document processing, with chunk deduplication, usage-based re-scoring, and document obsolescence detection

Migrate the ops memory UI (`/ops/memory`) to a knowledge UI (`/ops/knowledge`) with Explorer and Graph views for RAG data.

### Scope

**In Scope:**

1. User profile system — editable textarea in chat config panel + `update_user_profile` LLM tool integrated into the graph engine tool loop + periodic auto-synthesis via scheduled worker task
2. Conversation search — `conversation_search(query, max_results)` + `recent_conversations(n, sort_order)` as LLM tools, backed by PG full-text search via tsvector/GIN index
3. RAG pipeline multi-stage — refactor document processing into Redis Streams stages: `tasks:documents` -> extractor -> `rag:extracted` -> embedder -> `rag:embedded` -> storer
4. RAG consolidation — chunk deduplication at store time, usage-based re-scoring, document obsolescence detection
5. UI migration — `/ops/memory` removed, `/ops/knowledge` extended with Explorer + Graph + Overview tabs
6. Cleanup — remove entire memory module and ALL its dependents across the codebase (compaction, indexer, supervisor, admin, internal, CLI, metrics, embedding resolver, schemas, prompts)
7. Auto-synthesis — periodic cron job that reads recent conversations and merges user facts into the profile
8. Compaction refactoring — migrate compaction summaries from MemoryEntry to a dedicated `compaction_summary` field on the Conversation model

**Out of Scope:**

- Semantic/vector search on conversations (PG full-text only for now)
- Memory vector search (no more Qdrant "memory" collection)
- RAG collection CRUD changes (existing endpoints stay)
- Frontend chat UI changes beyond adding the user preferences panel
- RAG reranker changes (existing Noop/Cohere/CrossEncoder stays)

## Context for Development

### Codebase Patterns

**Engine (Python):**
- **Redis Streams pipeline**: `RedisStreamBus.subscribe(stream, group, consumer, handler)` returns async task. Handlers receive `dict[str, Any]`, publish to next stream via `bus.publish(stream, data)`. Consumer groups auto-created. Retry with DLQ after 3 failures. DLQ stream is `memory:dlq` (hardcoded constant in `redis_streams.py` AND hardcoded string literals in `internal/pipelines.py` — both must be renamed).
- **PipelineContext**: Shared dataclass in `pipeline/handlers/_common.py` for inter-handler data parsing.
- **Tool binding**: MCP tools discovered via `discover_and_convert()` -> returns `(lc_tools, MCPToolExecutor)`. `tool_loop.py` calls `tool_executor.execute(tool_name, tool_args)` with exactly 2 arguments. `MCPToolExecutor` is a class with `async execute(name, args) -> str` method. **Critical**: tools are discovered at `compile_agent_graph()` time but executed inside `agent_node(state, config)` closure at runtime. `user_id` is NOT available at compile time — only in `state.metadata` at runtime.
- **Context injection**: `AgentContextBuilder.build_context_messages()` returns `list[SystemMessage]` — calls `_get_memory_context()` only when `agent.memory_enabled is True` (gated at call site). After migration, `memory_enabled` gates user profile injection. Single injection point via `_get_memory_context()` replacement (Task 8 only).
- **Memory blast radius**: The `src/memory/` module is imported by 10+ external files: `prompt_layers/context.py`, `conversations/compaction.py`, `conversations/indexer.py`, `conversations/search.py`, `supervisor/service.py`, `admin/user_router.py`, `admin/schemas.py`, `internal/pipelines.py`, `cli.py`, **`alembic/env.py`** (top-level import of `MemoryEntry, ConsolidationLog, MemoryEdge` for model metadata detection). Additionally: `conversations/schemas.py` defines `MemoryEntrySummary`, `conversations/router.py` handles `memory_entries` in supervisor responses, `infra/metrics.py` defines 4 memory Prometheus counters, `embedding/resolver.py` has `get_memory_embedding_provider()`, `supervisor/prompts.py` formats memory context into routing prompts, `worker/scheduler.py` imports `reload_memory_config` from `src.memory.router`, and `supervisor/service.py` references `CONTEXT_BUDGET_MEMORY_PCT`. Frontend: `apps/chat/src/hooks/useChat.ts` destructures `memory_entries`, `useInsightsPanel.ts` has `setMemoryEntries`, `packages/ui/src/types/chat.ts` defines `InsightsMemoryEntry`, `packages/ui/src/lib/mappers.ts` has `mapMemoryEntries`. ALL must be cleaned.
- **Session lifecycle**: `async_session_maker()` from `src.infra.database` creates scoped sessions. Sessions should NOT be created at graph compile time and reused at execution time — create per-operation using `async with async_session_maker() as session:` inside tool handlers. **Important**: the module is `src.infra.database`, NOT `src.infra.db`.

**Frontend (TypeScript):**
- **Ops stores**: Zustand stores fetch from admin API endpoints, manage pagination/filters.
- **Graph viz**: Sigma 3.0 + Graphology + ForceAtlas2. Virtual anchor nodes, physics-based layout.
- **Config panel**: `ConfigTab` in `packages/ui`. User preferences textarea goes after Model section.
- **Knowledge page**: Currently has Company/Projects/Groups/Personal scope-filter tabs as the PRIMARY (only) tab set. Task 36 wraps these into a new "Collections" tab and adds top-level siblings: Overview, Explorer, Graph.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `engine/server/src/auth/models.py` | User model — add `preferences` + `last_profile_synthesis_at` fields |
| `engine/server/src/auth/service.py` | AuthService — add `update_preferences()` method |
| `engine/server/src/graph_engine/compiler.py` | `compile_agent_graph()` — tool discovery at compile time, `agent_node` closure at runtime. `user_id` NOT available at compile time. |
| `engine/server/src/graph_engine/tool_loop.py` | `run_tool_loop()` — calls `tool_executor.execute(name, args)`. Type hint `tool_executor: MCPToolExecutor` must be widened to protocol. |
| `engine/server/src/mcp/tool_adapter.py` | `MCPToolExecutor` class — `async execute(name, args) -> str`. Constructor: `__init__(registry, server_tool_map)`. |
| `engine/server/src/executions/service.py` | `execute_agent()` — has `execution.user_id` and `self.db`. Must set `state.metadata["user_id"]` on initial state. |
| `engine/server/src/conversations/models.py` | ConversationMessage — add tsvector; Conversation — add `compaction_summary` |
| `engine/server/src/conversations/compaction.py` | CompactionService — imports MemoryEntry, MemoryRepository, ConsolidationLog |
| `engine/server/src/conversations/indexer.py` | ConversationIndexer — imports QdrantMemoryVectorStore (to be deleted) |
| `engine/server/src/conversations/search.py` | ConversationSearchService — Qdrant-based, to be rewritten with tsvector |
| `engine/server/src/conversations/schemas.py` | Defines `MemoryEntrySummary`, used in `ContextData.memory_entries` and `SendMessageResponse.memory_entries` |
| `engine/server/src/conversations/router.py` | `_maybe_enqueue_marathon_extraction()` + `memory_entries` in supervisor response handling |
| `engine/server/src/supervisor/service.py` | `_get_memory_context()` called from TWO sites: routing (line ~313) and tool-response (line ~598) |
| `engine/server/src/supervisor/prompts.py` | Formats memory_context as `"Known facts about the user:\n{memory_context}"` in routing prompt |
| `engine/server/src/admin/user_router.py` | Admin memory endpoints (GET/DELETE user memory) |
| `engine/server/src/admin/schemas.py` | Re-exports MemoryEntryResponse, MemoryListResponse |
| `engine/server/src/internal/pipelines.py` | Pipeline monitoring — hardcodes `"memory:dlq"` in 3 places (lines ~63, ~74, ~288) instead of using constant |
| `engine/server/src/infra/metrics.py` | 4 memory Prometheus counters: `memory_extraction_enqueued`, `pipeline_facts_extracted`, `pipeline_embeddings_stored`, `pipeline_summaries_stored` |
| `engine/server/src/embedding/resolver.py` | `get_memory_embedding_provider()` — reads `MEMORY_EMBEDDING_*` settings, called by context.py and supervisor |
| `engine/server/src/cli.py` | `backfill-qdrant` command — uses QdrantMemoryVectorStore |
| `engine/server/src/infra/config.py` | 20+ `MEMORY_*` / `FACT_EXTRACTION_*` settings + `CONVERSATION_INDEXING_ENABLED` / `CONVERSATION_INDEX_MODE` |
| `engine/server/src/infra/redis_streams.py` | `DLQ_STREAM = "memory:dlq"` hardcoded constant |
| `engine/server/src/worker/scheduler.py` | `memory_consolidation()` + `memory_extraction_scan()` jobs + `from src.memory.router import reload_memory_config` |
| `engine/server/src/graph_engine/interfaces.py` | `AgentConfig.memory_enabled: bool = True` — gates memory/profile injection |
| `engine/server/src/rag/models.py` | RAGChunk — add `access_count`, `last_accessed`, `embedding_cache` columns |
| `engine/server/src/rag/processor.py` | Monolithic `process_document()` to split into stages |
| `engine/server/src/rag/vector_store.py` | `upsert_chunks()` — reuse in storer handler |
| `engine/server/src/rag/chunker.py` | `ChunkerFactory` — reuse in extractor handler |
| `engine/server/src/worker/runner.py` | Stream wiring — replace memory with RAG stages |
| `packages/ui/src/components/insights/ConfigTab.tsx` | Model section — add preferences textarea after |
| `packages/ui/src/lib/chat-config.ts` | ChatConfig type — add `userPreferences` field |
| `apps/ops/src/components/memory/` | Memory UI components to adapt for knowledge |
| `apps/ops/src/pages/Knowledge.tsx` | Existing page with Company/Projects/Groups/Personal scope tabs — extend with top-level tab navigation |

### Technical Decisions

- **User profile storage**: Plain text field `preferences` on User model in PG. Max 2000 chars enforced at API and tool handler level. Injected as SystemMessage via `_get_memory_context()` replacement (single injection point — Task 8 only, NOT duplicated in compiler).
- **`memory_enabled` gating**: The existing `AgentConfig.memory_enabled` boolean now gates user profile injection. Agents with `memory_enabled=False` do NOT receive profile injection. This preserves opt-out behavior. No field rename needed (DB column stays, semantics documented).
- **Auto-synthesis**: Cron job (configurable, default 24h). Processes users in batches of 20 with `asyncio.gather()` concurrency. LLM validates output before saving (non-empty, < 2000 chars, not a refusal). Stores `last_profile_synthesis_at` on User model.
- **Conversation search**: PG tsvector with `'simple'` dictionary (language-agnostic, no stemming) for multilingual support. GIN index. Replaces existing Qdrant-based `ConversationSearchService`.
- **Built-in tool executor architecture**: `user_id` is NOT available at `compile_agent_graph()` time — only inside `agent_node(state, config)` closure via `state.metadata["user_id"]`. Therefore: (1) `ExecutionService.execute_agent()` sets `state.metadata["user_id"] = execution.user_id` on initial state, (2) tool definitions are added at compile time (static, don't need user_id), (3) `create_builtin_executor(user_id, session_maker)` is called lazily inside `agent_node` where `state` is available, (4) `session_maker` (not a session) is passed — each tool call creates its own session via `async with session_maker() as session:` for correct lifecycle, (5) `UnifiedToolExecutor` class wraps both builtin and MCP executors with a proper `async execute(name, args) -> str` method matching the existing interface.
- **Compaction refactoring**: Compaction summaries move from `MemoryEntry` to `Conversation.compaction_summary: Text`. CompactionService rewritten to store/load summaries from Conversation model directly. No more MemoryEntry dependency.
- **RAG multi-stage**: 3 Redis Streams stages. Embeddings stored temporarily in PG `RAGChunk.embedding_cache` column (JSONB) between embedder and storer stages (avoids serializing large float arrays through Redis). Storer reads from PG, not Redis payload. On failure: extractor is idempotent (checks existing chunks by document_id before creating), storer can re-read from PG.
- **RAG dedup timing**: Dedup happens at STORE time (Task 23), NOT at extraction time. Reason: at extraction time chunks have no embeddings — embeddings are generated later by the embedder stage. The storer, which has both the new chunk embeddings (from PG `embedding_cache`) and access to existing chunks in Qdrant, can perform vector similarity comparison.
- **RAG consolidation**: Dedup at store time per-chunk (compare new chunk against top-5 similar existing chunks in same collection via Qdrant). Usage decay + obsolescence detection run periodically via cron. Decay: batch LIMIT 1000 per run.
- **DLQ rename**: `memory:dlq` -> `pipeline:dlq`. Must update BOTH the constant in `redis_streams.py` AND the 3 hardcoded string literals in `internal/pipelines.py`. Migration step: drain existing DLQ messages first.
- **Feature flag**: `RAG_MULTI_STAGE_ENABLED: bool = False` (default OFF for safety). Old monolithic handler runs by default. Explicit opt-in after testing. Allows rollback without code change.
- **Config cleanup**: Remove all `MEMORY_*`, `FACT_EXTRACTION_*`, `CONVERSATION_INDEXING_*` settings from config. Rename `CONTEXT_BUDGET_MEMORY_PCT` to `CONTEXT_BUDGET_PROFILE_PCT` (default 5.0). Remove `get_memory_embedding_provider()` from `embedding/resolver.py`. Add `PROFILE_SYNTHESIS_*` and `RAG_CONSOLIDATION_*` settings in Phase 4 (before they're needed).
- **Migration ordering**: `last_memory_extracted_at` column drop is deferred to Phase 9 migration (NOT Phase 1). This avoids runtime errors while old code still reads the column between Phase 1 migration and Phase 9 code deploy. See Deployment Notes.

## Implementation Plan

### Tasks

#### Phase 1: Database & Models (foundation, no breaking changes)

- [ ] Task 1: Add `preferences` and `last_profile_synthesis_at` to User model
  - File: `engine/server/src/auth/models.py`
  - Action: Add `preferences: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)` and `last_profile_synthesis_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)` to User class
  - Notes: Nullable text fields, no data migration needed

- [ ] Task 2: Add `compaction_summary` to Conversation model
  - File: `engine/server/src/conversations/models.py`
  - Action: Add `compaction_summary: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)` to Conversation.
  - Notes: `compaction_summary` replaces MemoryEntry(tier=SUMMARY, scope=CONVERSATION). `last_memory_extracted_at` stays for now — dropped in Phase 9 migration (Task 51) to avoid breaking running code.

- [ ] Task 3: Add tsvector column and GIN index to ConversationMessage
  - File: `engine/server/src/conversations/models.py`
  - Action: Add `from sqlalchemy.dialects.postgresql import TSVECTOR` import. Add `search_vector: Mapped[Any] = mapped_column(TSVECTOR, nullable=True)` to ConversationMessage. Add `Index("ix_message_search_vector", search_vector, postgresql_using="gin")` to `__table_args__`
  - Notes: Use `'simple'` dictionary (not `'english'`) for multilingual support. Column populated via PG trigger (created in migration).

- [ ] Task 4: Create Alembic migration for all Phase 1 schema changes
  - File: `engine/server/alembic/versions/<new>_memory_to_rag_schema.py`
  - Action: Single migration that:
    1. Adds `preferences` and `last_profile_synthesis_at` to `users` table
    2. Adds `compaction_summary` to `conversations` table
    3. Backfills compaction_summary: `UPDATE conversations c SET compaction_summary = (SELECT content FROM memory_entries me WHERE me.scope = 'conversation' AND me.scope_id = c.id AND me.tier = 'summary' AND me.expired_at IS NULL ORDER BY me.created_at DESC LIMIT 1)`
    4. Adds `search_vector` (TSVECTOR) to `conversation_messages` table
    5. Creates GIN index `ix_message_search_vector`
    6. Creates PG trigger: `CREATE FUNCTION msg_search_vector_update() RETURNS trigger AS $$ BEGIN NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content, '')); RETURN NEW; END $$ LANGUAGE plpgsql; CREATE TRIGGER msg_search_vector_trigger BEFORE INSERT OR UPDATE ON conversation_messages FOR EACH ROW EXECUTE FUNCTION msg_search_vector_update();`
    7. Backfills tsvector in batches: `DO $$ DECLARE batch_size INT := 5000; affected INT := 1; BEGIN WHILE affected > 0 LOOP UPDATE conversation_messages SET search_vector = to_tsvector('simple', COALESCE(content, '')) WHERE id IN (SELECT id FROM conversation_messages WHERE search_vector IS NULL LIMIT batch_size); GET DIAGNOSTICS affected = ROW_COUNT; RAISE NOTICE 'Updated % rows', affected; END LOOP; END $$;`
  - Notes: Single migration keeps schema changes atomic. Batched backfill avoids table lock. Does NOT drop `last_memory_extracted_at` — deferred to Task 51.

- [ ] Task 5: Add `access_count` and `last_accessed` to RAGChunk model + migration
  - File: `engine/server/src/rag/models.py`
  - Action: Add `access_count: Mapped[int] = mapped_column(default=0)` and `last_accessed: Mapped[datetime | None] = mapped_column(nullable=True)` to RAGChunk. Create separate Alembic migration.
  - Notes: Needed for usage-based re-scoring in RAG consolidation.

#### Phase 2: User Profile Backend

- [ ] Task 6: Add `update_preferences()` to AuthService
  - File: `engine/server/src/auth/service.py`
  - Action: Add async method `update_preferences(self, user_id: str, preferences: str) -> None` that validates `len(preferences) <= 2000`, loads user by ID, sets `user.preferences = preferences`, flushes.
  - Notes: Enforce 2000 char limit here (server-side validation).

- [ ] Task 7: Add user preferences API endpoints
  - File: `engine/server/src/auth/router.py`
  - Action: Add `GET /me/preferences` (returns `{ preferences: str | null }`) and `PATCH /me/preferences` (body: `{ preferences: str }`, max 2000 chars, calls `auth_service.update_preferences()`). Both require authenticated user.
  - Notes: Auth router is mounted at `/api/v1/auth`, so full paths become `/api/v1/auth/me/preferences`. No conflict with existing `GET /me` or `PUT /me`.

- [ ] Task 8: Replace `_get_memory_context()` with user profile injection
  - File: `engine/server/src/prompt_layers/context.py`
  - Action:
    1. Replace the body of `_get_memory_context()` with: load user by `user_id` from `session` (already a parameter), return `user.preferences` formatted as `"## User Profile\n{preferences}"` if non-empty, else empty string.
    2. Remove ALL imports from `src.memory.*` in this method.
    3. Remove the `_get_memory_embedding_provider()` static method (becomes dead code).
    4. Keep the method signature unchanged: `async def _get_memory_context(self, agent, query, session, user_id, *, max_tokens)`.
    5. **The `agent.memory_enabled` gate at the call site stays** — it now controls whether user profile is injected. This preserves opt-out behavior for agents that should not receive user context.
  - Notes: This is the SINGLE injection point for user profile. Do NOT add a second injection in compiler.py, supervisor, or agent_invoker. The `agent` and `query` parameters become unused after this change — keep them for signature stability (callers pass them positionally). Document as vestigial in a code comment.

- [ ] Task 9: Replace memory imports in `_get_conversation_history()`
  - File: `engine/server/src/prompt_layers/context.py`
  - Action: The `_get_conversation_history()` method imports `MemoryEntry, MemoryScope, MemoryTier` to load compaction summaries. Replace the MemoryEntry query block with: `summary = (await session.execute(select(Conversation.compaction_summary).where(Conversation.id == conversation_id))).scalar()`. Remove the MemoryEntry imports. `Conversation` is already imported in this file — no new import needed.
  - Notes: This works because Task 2 moved compaction summaries to `Conversation.compaction_summary`.

#### Phase 3: Built-in Tools (conversation search + user profile tool)

- [ ] Task 10: Create built-in tools module
  - File: `engine/server/src/graph_engine/builtin_tools.py` (new)
  - Action: Create module with:
    1. `BUILTIN_TOOL_NAMES = {"conversation_search", "recent_conversations", "update_user_profile"}` — set of known built-in tool names
    2. `get_builtin_tool_definitions() -> list[dict]` — returns OpenAI-compatible function defs (same format as MCP tools from `discover_and_convert`)
    3. `create_builtin_executor(user_id: str, session_maker: Callable) -> Callable` — returns a closure that creates a new DB session per tool call:
       ```python
       def create_builtin_executor(user_id: str, session_maker):
           async def execute(tool_name: str, tool_args: dict) -> str:
               async with session_maker() as session:
                   if tool_name == "conversation_search":
                       return await _handle_conversation_search(tool_args, user_id, session)
                   elif tool_name == "recent_conversations":
                       return await _handle_recent_conversations(tool_args, user_id, session)
                   elif tool_name == "update_user_profile":
                       return await _handle_update_user_profile(tool_args, user_id, session)
                   raise ValueError(f"Unknown built-in tool: {tool_name}")
           return execute
       ```
    4. `UnifiedToolExecutor` class with proper `.execute(name, args) -> str` method:
       ```python
       class UnifiedToolExecutor:
           """Dispatches tool calls to built-in or MCP executors."""
           def __init__(self, builtin_fn, mcp_executor, builtin_names):
               self._builtin = builtin_fn
               self._mcp = mcp_executor
               self._names = builtin_names

           async def execute(self, name: str, args: dict[str, Any]) -> str:
               if name in self._names:
                   return await self._builtin(name, args)
               if self._mcp:
                   return await self._mcp.execute(name, args)
               raise ValueError(f"Unknown tool: {name}")
       ```
    5. `update_user_profile` tool enforces max 2000 chars on `preferences` param
  - Notes: The `session_maker` pattern ensures each tool call gets a fresh DB session with correct lifecycle. `UnifiedToolExecutor` matches `MCPToolExecutor`'s `execute(name, args)` interface via duck typing.

- [ ] Task 11: Implement `conversation_search` tool handler
  - File: `engine/server/src/graph_engine/builtin_tools.py`
  - Action: `_handle_conversation_search(args, user_id, session)`:
    1. Extract `query: str`, `max_results: int` (default 5, max 10)
    2. Query via SQLAlchemy ORM:
       ```python
       tsquery = func.plainto_tsquery("simple", query)
       results = await session.execute(
           select(ConversationMessage.content, ConversationMessage.role,
                  ConversationMessage.created_at, Conversation.title)
           .join(Conversation, ConversationMessage.conversation_id == Conversation.id)
           .where(ConversationMessage.search_vector.op("@@")(tsquery))
           .where(Conversation.user_id == user_id)
           .order_by(func.ts_rank(ConversationMessage.search_vector, tsquery).desc())
           .limit(max_results)
       )
       ```
    3. Format results as: `"Conversation: {title} ({date})\n{role}: {content}\n---"`
    4. Return formatted string or "No results found"
  - Notes: Uses `'simple'` dictionary (matching Task 3). SQLAlchemy ORM style consistent with rest of codebase. Filter by user_id for data isolation. After Task 40 rewrites `ConversationSearchService` with the same tsvector query, consider refactoring to have this tool handler delegate to `ConversationSearchService.search()` to DRY the query logic.

- [ ] Task 12: Implement `recent_conversations` tool handler
  - File: `engine/server/src/graph_engine/builtin_tools.py`
  - Action: `_handle_recent_conversations(args, user_id, session)`:
    1. Extract `n: int` (default 3, max 20), `sort_order: str` (default "desc")
    2. Query PG for N most recent conversations with title, date, last message preview (first 200 chars)
    3. Format as list: `"- {title} ({date}): {preview}..."`
  - Notes: Only user's own conversations.

- [ ] Task 13: Implement `update_user_profile` tool handler
  - File: `engine/server/src/graph_engine/builtin_tools.py`
  - Action: `_handle_update_user_profile(args, user_id, session)`:
    1. Extract `preferences: str`
    2. Validate len <= 2000, return error message if exceeded
    3. Update user preferences in DB
    4. Return `"User profile updated successfully."`
  - Notes: Full replace, not merge. LLM sees current profile in system prompt and can read-modify-write.

- [ ] Task 14: Inject built-in tools into graph engine
  - Files: `engine/server/src/graph_engine/compiler.py`, `engine/server/src/graph_engine/tool_loop.py`, `engine/server/src/executions/service.py`
  - Action:
    1. **In `executions/service.py`** (`execute_agent()`): When creating initial state via `create_initial_state()`, ensure `state["metadata"]["user_id"] = execution.user_id` is set. `GraphState.metadata` is a `dict` field — verify it's populated before `graph.ainvoke(state, config)`. Note: the worker path (`worker/tasks.py` → `graph_execution_handler`) calls `service.execute(execution_id)` which delegates to `execute_agent()`, so this covers both inline and distributed execution paths.
    2. **In `compiler.py`** (`compile_agent_graph()`): After MCP tool discovery, conditionally append built-in tool definitions to `lc_tools`. Only add builtin defs when tools will actually be usable:
       ```python
       from src.graph_engine.builtin_tools import get_builtin_tool_definitions, BUILTIN_TOOL_NAMES
       _builtin_defs = get_builtin_tool_definitions()
       # Append at compile time — defs are static, don't need user_id
       lc_tools.extend(_builtin_defs)
       ```
       **Guard**: if `user_id` is not in state at runtime (e.g., non-standard graph invocation), built-in tool calls will fail gracefully with an error message rather than crash. See step 3.
    3. **In `compiler.py`** (`agent_node` closure): Create executor lazily where `state` is available:
       ```python
       # Inside agent_node(state, config):
       user_id = (state.get("metadata") or {}).get("user_id")
       if user_id:
           from src.graph_engine.builtin_tools import (
               create_builtin_executor, UnifiedToolExecutor, BUILTIN_TOOL_NAMES
           )
           from src.infra.database import async_session_maker  # NOTE: src.infra.database, NOT src.infra.db
           builtin_exec = create_builtin_executor(user_id, async_session_maker)
           unified_executor = UnifiedToolExecutor(builtin_exec, _tool_executor, BUILTIN_TOOL_NAMES)
       elif _tool_executor:
           unified_executor = _tool_executor  # MCP-only
       else:
           unified_executor = None
       # Pass unified_executor to run_tool_loop() instead of _tool_executor
       ```
       **Edge case**: if `user_id` is None but builtin tool defs were added to LLM tools, the LLM might still attempt to call them. The `UnifiedToolExecutor` won't exist, so the MCP executor (or None) handles the call and raises "Unknown tool". This is acceptable — log a warning. For extra safety, filter out builtin defs from `_lc_tools` when `user_id` is None inside the closure before binding.
    4. **In `tool_loop.py`**: Widen the type hint from `tool_executor: MCPToolExecutor` to a duck-typed protocol. Add at module level:
       ```python
       from typing import Protocol

       class ToolExecutor(Protocol):
           async def execute(self, name: str, args: dict[str, Any]) -> str: ...
       ```
       Update `run_tool_loop` signature to use `tool_executor: ToolExecutor`. Do NOT use `@runtime_checkable` — it's unnecessary overhead and the bare `create_builtin_executor` closure is never checked against this protocol directly (only `UnifiedToolExecutor` is).
  - Notes: This architecture solves three problems: (1) user_id flows through state.metadata, available at runtime not compile time, (2) DB session created per-call via `async_session_maker` (from `src.infra.database`) for correct lifecycle, (3) UnifiedToolExecutor has proper `.execute()` method matching the protocol. The supervisor execution path also flows through `execute_agent()` so user_id is set for all agent paths. **Graph execution**: `execute_graph()` also calls `create_initial_state()` — set `user_id` there too for consistency. However, graph nodes use `_create_agent_node()` which is a different code path that doesn't do tool discovery. Built-in tools are NOT available in graph execution mode (only in `compile_agent_graph`). This is acceptable — graph nodes have their own tool configuration.

#### Phase 4: Auto-Synthesis (periodic user profile enrichment)

- [ ] Task 15: Add synthesis and consolidation config settings
  - File: `engine/server/src/infra/config.py`
  - Action: Add to Settings class:
    - `PROFILE_SYNTHESIS_MODEL: str = ""` (fallback to first available chat model)
    - `PROFILE_SYNTHESIS_INTERVAL: int = 86400` (24h in seconds)
    - `RAG_CONSOLIDATION_INTERVAL: int = 21600` (6h in seconds)
  - Notes: Added in Phase 4 (before Phase 5 and synthesis code needs them). NOT in Phase 9 where config cleanup happens.

- [ ] Task 16: Create user profile synthesis service
  - File: `engine/server/src/auth/profile_synthesizer.py` (new)
  - Action: Create class `ProfileSynthesizer` with:
    ```python
    async def synthesize(self, user_id: str, db: AsyncSession) -> str | None:
    ```
    1. Load user's current preferences and `last_profile_synthesis_at`
    2. Query conversations newer than last synthesis (or all if first run)
    3. If no new conversations, return None
    4. Load last 50 messages from those conversations
    5. Call LLM with synthesis prompt (use `PROFILE_SYNTHESIS_MODEL` config)
    6. **Validate LLM output**: non-empty, len <= 2000, does not start with "I cannot" / "I'm sorry" (refusal detection)
    7. If validation fails, log warning and return None (don't overwrite profile)
    8. Update `user.preferences` and `user.last_profile_synthesis_at`
    9. Return new profile text
  - Notes: Use `PROFILE_SYNTHESIS_MODEL` config from Task 15. Fallback mechanism: if empty string, use `ConfigProvider.list_models()` to get available models and pick the first chat-capable model (same pattern used by `SupervisorService._resolve_model()`).

- [ ] Task 17: Add synthesis cron job to scheduler
  - File: `engine/server/src/worker/scheduler.py`
  - Action: Add scheduled job `profile_synthesis_scan`:
    1. Runs every `PROFILE_SYNTHESIS_INTERVAL` seconds (default 86400 = 24h)
    2. Query users with new conversations since last synthesis, LIMIT 100
    3. Process in batches of 20 using `asyncio.gather()` with `return_exceptions=True`
    4. Log successes and failures per batch
    5. If more users remain, schedule another run sooner (or process in next interval)
  - Notes: This is a NEW job. Old `memory_extraction_scan` and `memory_consolidation` jobs are removed in Phase 9 (Task 48). Both can coexist temporarily.

#### Phase 5: RAG Pipeline Multi-Stage

- [ ] Task 18: Add `RAG_MULTI_STAGE_ENABLED` feature flag
  - File: `engine/server/src/infra/config.py`
  - Action: Add `RAG_MULTI_STAGE_ENABLED: bool = False` to Settings class
  - Notes: Default OFF for safety. Old monolithic handler runs by default. Explicit opt-in after testing. Set to `True` only after verifying multi-stage pipeline works correctly.

- [ ] Task 19: Rename DLQ stream constant + fix hardcoded strings
  - File: `engine/server/src/infra/redis_streams.py`
  - Action: Change `DLQ_STREAM = "memory:dlq"` to `DLQ_STREAM = "pipeline:dlq"`. Before deploying: drain existing `memory:dlq` messages (process or discard).
  - File: `engine/server/src/internal/pipelines.py`
  - Action: Replace ALL 3 hardcoded `"memory:dlq"` string literals (~lines 63, 74, 288) with `DLQ_STREAM` constant imported from `src.infra.redis_streams`. This includes the `purge_dlq()` endpoint which directly trims `"memory:dlq"`.
  - Notes: MUST be done together in the same deploy. If the constant is renamed but the hardcoded strings remain, the pipeline monitoring and purge endpoints will read/write the wrong stream.

- [ ] Task 20: Create RAG extractor handler
  - File: `engine/server/src/rag/handlers/extractor.py` (new)
  - Action: Create `document_extract_handler(data: dict) -> None`:
    1. Parse `document_id`, `collection_id`, `object_key`, `filename` from data
    2. Check for existing chunks with same `document_id` (idempotency — skip if already extracted)
    3. Download file from S3 (MinIO)
    4. Call `extract_text(file_content, filename)` from `rag/processor.py`
    5. Fetch collection metadata for chunk strategy/size/overlap
    6. Instantiate chunker via `ChunkerFactory.get_chunker()`
    7. Split text into chunks
    8. Create `RAGChunk` records in PG (content, position, metadata)
    9. Update document status to `PROCESSING`
    10. Publish to `rag:extracted` stream with: `document_id`, `collection_id`, `chunk_ids` (list of UUIDs)
  - Notes: Do NOT include `chunk_contents` in Redis message. The embedder reads content from PG by chunk_id. No dedup here — dedup happens at store time (Task 23) when embeddings are available.

- [ ] Task 21: Add `embedding_cache` column to RAGChunk + migration
  - File: `engine/server/src/rag/models.py`
  - Action: Add `embedding_cache: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)` to RAGChunk model. Create Alembic migration to add the column.
  - Notes: Temporary storage for embeddings between embedder and storer stages. Cleared by storer after Qdrant upsert. Avoids serializing large float arrays through Redis messages.

- [ ] Task 22: Create RAG embedder handler
  - File: `engine/server/src/rag/handlers/embedder.py` (new)
  - Action: Create `document_embed_handler(data: dict) -> None`:
    1. Read `chunk_ids` from stream data
    2. Load chunk contents from PG: `SELECT id, content FROM rag_chunks WHERE id IN (:chunk_ids)`
    3. Get knowledge embedding provider
    4. Batch embed all chunks (100 at a time) via `embed_texts()`
    5. Store embeddings in PG `RAGChunk.embedding_cache` column (JSONB)
    6. Publish to `rag:embedded` stream with: `document_id`, `collection_id`, `chunk_ids`
  - Notes: Embeddings stored in PG temporarily, NOT serialized through Redis.

- [ ] Task 23: Create RAG storer handler (with dedup-at-store)
  - File: `engine/server/src/rag/handlers/storer.py` (new)
  - Action: Create `document_store_handler(data: dict) -> None`:
    1. Read `chunk_ids` from stream data
    2. Load chunks + embeddings from PG (`embedding_cache` column)
    3. **Dedup check**: For each chunk, query Qdrant directly using the dense vector only (NOT the hybrid search method which returns RRF-fused scores). Use `qdrant_client.search(collection, query_vector=chunk_embedding, limit=5, query_filter=Filter(must=[FieldCondition(key="collection_id", match=MatchValue(value=collection_id))]))`. If any result has cosine similarity > 0.95, skip storing this chunk (log as dedup'd).
    4. Build `ChunkData` objects with embeddings, scope, ACL metadata for non-duplicate chunks
    5. Call `vector_store.upsert_chunks(qdrant_chunks)` to write to Qdrant
    6. Clean up: set `embedding_cache = None` on all processed RAGChunks in PG
    7. Update `RAGDocument.status` to `READY`, set `chunk_count`
    8. Update `RAGCollection` aggregate counts
    9. Commit transaction
  - Notes: Dedup happens HERE (not in extractor) because embeddings are now available. The storer has the new chunk's embedding (from PG) and can query existing chunks in Qdrant. This is O(n) per document (one Qdrant query per new chunk, top-5 results). Terminal stage. On failure: chunks exist in PG but not Qdrant. Document stays PROCESSING. Can retry by re-publishing to `rag:embedded`.

- [ ] Task 24: Wire RAG stages in worker runner
  - File: `engine/server/src/worker/runner.py`
  - Action:
    1. **Remove ALL top-level memory pipeline handler imports** (currently lines ~78-80): `from src.pipeline.handlers.embedder import embedder_handler`, `from src.pipeline.handlers.extractor import extractor_handler`, `from src.pipeline.handlers.summarizer import summarizer_handler`. These are unconditional imports that will crash the worker when Phase 9 deletes the pipeline handler files.
    2. **Remove ALL memory stream subscriptions** (the `bus.subscribe("memory:raw", ...)`, `bus.subscribe("memory:extracted", ...)`, etc. calls).
    3. **Replace document processing with feature-flagged conditional imports**:
       ```python
       from src.infra.config import get_settings
       settings = get_settings()
       if settings.RAG_MULTI_STAGE_ENABLED:
           from src.rag.handlers.extractor import document_extract_handler
           from src.rag.handlers.embedder import document_embed_handler
           from src.rag.handlers.storer import document_store_handler
           bus.subscribe("tasks:documents", "rag-extractors", "ext-1", document_extract_handler)
           bus.subscribe("rag:extracted", "rag-embedders", "emb-1", document_embed_handler)
           bus.subscribe("rag:embedded", "rag-storers", "stor-1", document_store_handler)
       else:
           from src.worker.tasks import document_process_handler
           bus.subscribe("tasks:documents", "doc-processors", "dp-1", document_process_handler)
       ```
    4. Keep non-memory imports at top level: `graph_execution_handler`, `model_pull_handler`, etc.
  - Notes: **Critical**: the memory handler imports are currently at the TOP of the file (unconditional). They MUST be removed in this task, not deferred to Phase 9, otherwise the worker will crash on import after Phase 9 deletes the handler files. The `document_process_handler` import is inside the `else` branch — it only runs when the feature flag is False, avoiding unused-import warnings.

#### Phase 6: RAG Consolidation

- [ ] Task 25: Create RAG consolidator
  - File: `engine/server/src/rag/consolidator.py` (new)
  - Action: Create class `RAGConsolidator` with:
    1. `async decay_unused_chunks(db: AsyncSession, days_threshold: int = 30, batch_limit: int = 1000) -> int`:
       - Query: `SELECT id FROM rag_chunks WHERE access_count = 0 AND created_at < :threshold LIMIT :batch_limit`
       - For each batch: reduce Qdrant importance payload or delete from Qdrant
       - Return total count
    2. `async detect_obsolete_documents(collection_id: str, db: AsyncSession) -> list[str]`:
       - Query: `SELECT filename, array_agg(id ORDER BY created_at DESC) FROM rag_documents WHERE collection_id = :coll_id GROUP BY filename HAVING count(*) > 1`
       - For each filename with multiple documents: flag all but the newest as obsolete
       - Return list of obsolete document IDs
  - Notes: Dedup is handled at store time (Task 23), NOT in consolidator. Consolidator only handles periodic decay and obsolescence. Decay uses batch_limit to cap work per run.

- [ ] Task 26: Add RAG consolidation cron job
  - File: `engine/server/src/worker/scheduler.py`
  - Action: Add scheduled job `rag_consolidation`:
    1. Runs every `RAG_CONSOLIDATION_INTERVAL` seconds (default 21600 = 6h)
    2. Run `decay_unused_chunks(batch_limit=1000)`
    3. For each collection: run `detect_obsolete_documents()`
    4. Log summary
  - Notes: Dedup runs at store time (Task 23), not in cron.

- [ ] Task 27: Track chunk access in RAG retriever
  - File: `engine/server/src/rag/repository.py`
  - Action: After `search_hybrid()` returns results, fire-and-forget update of `access_count` and `last_accessed`:
    ```python
    async def _update_chunk_access(session_maker, chunk_ids: list[str]):
        try:
            async with session_maker() as session:
                await session.execute(
                    update(RAGChunk)
                    .where(RAGChunk.id.in_(chunk_ids))
                    .values(access_count=RAGChunk.access_count + 1, last_accessed=func.now())
                )
                await session.commit()
        except Exception:
            logger.warning("Failed to update chunk access counts", exc_info=True)

    # Prevent GC of fire-and-forget task
    _bg_tasks: set[asyncio.Task] = set()  # module-level set
    task = asyncio.create_task(_update_chunk_access(async_session_maker, result_chunk_ids))
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
    ```
  - Notes: Place the `asyncio.create_task` call inside `RAGRepository.search_hybrid()` after collecting results. The `_bg_tasks` set prevents garbage collection of the fire-and-forget task (standard Python pattern). Uses `async_session_maker` (imported from `src.infra.database`) for a separate transaction. Qdrant point IDs are the same UUIDs as `RAGChunk.id` — both set at chunk creation in `rag/vector_store.py` `upsert_chunks()`. The `try/except` ensures search never fails due to access tracking.

#### Phase 7: Frontend — User Preferences Panel

- [ ] Task 28: Add `userPreferences` to ChatConfig type
  - File: `packages/ui/src/lib/chat-config.ts`
  - Action: Add `userPreferences: string | null` to interface. Add `userPreferences: null` to `DEFAULT_CHAT_CONFIG`.

- [ ] Task 29: Add preferences textarea to ConfigTab
  - File: `packages/ui/src/components/insights/ConfigTab.tsx`
  - Action: After the Model section, add a "User Profile" section with a `Textarea` (max 2000 chars). Save on blur via callback prop. Show character count.
  - Notes: Add `onSavePreferences?: (prefs: string) => Promise<void>` to `ConfigTabProps`.

- [ ] Task 30: Wire preferences loading and saving in chat app
  - File: `apps/chat/src/hooks/useChatConfig.ts` (or new hook)
  - Action: Load preferences on mount via `GET /auth/me/preferences`, save on blur via `PATCH /auth/me/preferences`. Wire to ConfigTab.

#### Phase 8: Frontend — Knowledge UI Migration

- [ ] Task 31: Create knowledge admin API endpoints
  - File: `engine/server/src/rag/router.py`
  - Action: Add admin endpoints:
    1. `GET /rag/admin/stats/global` — totals and distributions
    2. `GET /rag/admin/explore` — paginated chunk browser with filters
    3. `GET /rag/admin/graph` — nodes (documents + collections) + edges

- [ ] Task 32: Extend knowledge store
  - File: `apps/ops/src/stores/knowledge.ts`
  - Action: Add `globalStats`, `explorerEntries`, `graphData`, filters, pagination actions.

- [ ] Task 33: Create KnowledgeOverviewTab
  - File: `apps/ops/src/components/knowledge/KnowledgeOverviewTab.tsx`
  - Action: KPI cards + distribution cards adapted from MemoryOverviewTab.

- [ ] Task 34: Create KnowledgeExplorerTab
  - File: `apps/ops/src/components/knowledge/KnowledgeExplorerTab.tsx`
  - Action: ResourceTable with chunk data, filters, pagination.

- [ ] Task 35: Create KnowledgeGraphTab
  - File: `apps/ops/src/components/knowledge/KnowledgeGraphTab.tsx`
  - Action: Sigma/Graphology graph at document level (not chunk level for performance). Collection nodes as anchors, document nodes connected to collections.

- [ ] Task 36: Extend Knowledge page with two-level tabs
  - File: `apps/ops/src/pages/Knowledge.tsx`
  - Action: Wrap the existing page content in a new two-level tab structure:
    1. Add a NEW outer `<Tabs>` component with triggers: **Collections**, **Overview**, **Explorer**, **Graph**
    2. Move ALL existing page content (the current `<Tabs defaultValue="company">` with Company/Projects/Groups/Personal) into `<TabsContent value="collections">`
    3. Add `<TabsContent value="overview">` → `<KnowledgeOverviewTab />`
    4. Add `<TabsContent value="explorer">` → `<KnowledgeExplorerTab />`
    5. Add `<TabsContent value="graph">` → `<KnowledgeGraphTab />`
    6. Sync top-level tab value with `useSearchParams` (e.g., `?tab=collections`)
  - Notes: The existing page has NO "Collections" wrapper — the scope tabs (Company/Projects/Groups/Personal) are the PRIMARY and only tab set. This task wraps them into a "Collections" container tab.

- [ ] Task 37: Update chat MemoryTab
  - File: `packages/ui/src/components/insights/MemoryTab.tsx`
  - Action: Remove "Recalled Memories" section. Keep History + Knowledge sections. Do NOT rename the tab or component — renaming would break all import sites without clear benefit.

#### Phase 9: Cleanup (MUST address ALL memory dependents)

- [ ] Task 38: Refactor CompactionService to remove memory dependency
  - File: `engine/server/src/conversations/compaction.py`
  - Action:
    1. Remove ALL imports from `src.memory.*` — specifically: `from src.memory.models import MemoryEntry, MemoryScope, MemoryTier, ConsolidationLog` and `from src.memory.repository import MemoryRepository`. These are top-level imports that will crash on import after Task 46 deletes the memory module.
    2. Replace `_get_existing_summary()`: query `Conversation.compaction_summary` instead of `MemoryEntry`
    3. Replace `_store_summary()`: set `conversation.compaction_summary = summary_text` instead of creating MemoryEntry
    4. Remove `ConsolidationLog` creation entirely (it's a memory-module model that will be deleted)
    5. Remove embedding generation for summaries (no longer stored in Qdrant)
  - Notes: CRITICAL — CompactionService is called during execution when history budget exceeded. Must work after migration. The imports are at module level, not lazy — they MUST be removed or the file will fail to import.

- [ ] Task 39: Remove ConversationIndexer
  - File: `engine/server/src/conversations/indexer.py`
  - Action: Delete file entirely. Remove all imports/calls to `ConversationIndexer` across the codebase (search for `indexer` in conversations/).
  - Notes: Conversation indexing to Qdrant is replaced by PG tsvector (Task 3). The indexer was feeding the old Qdrant-based search.

- [ ] Task 40: Replace ConversationSearchService with tsvector
  - File: `engine/server/src/conversations/search.py`
  - Action: Rewrite `ConversationSearchService.search()` to use PG tsvector instead of Qdrant:
    ```python
    async def search(self, query: str, user_id: str, limit: int = 10) -> list[dict]:
        tsquery = func.plainto_tsquery("simple", query)
        results = await self.db.execute(
            select(ConversationMessage, Conversation.title)
            .join(Conversation)
            .where(ConversationMessage.search_vector.op("@@")(tsquery))
            .where(Conversation.user_id == user_id)
            .order_by(func.ts_rank(ConversationMessage.search_vector, tsquery).desc())
            .limit(limit)
        )
        return [...]
    ```
    Remove import of `QdrantMemoryVectorStore` and all Qdrant usage.
  - Notes: Existing `/conversations/search` API endpoint continues to work with new implementation.

- [ ] Task 41: Replace supervisor memory context with user profile
  - Files: `engine/server/src/supervisor/service.py`, `engine/server/src/supervisor/prompts.py`
  - Action:
    1. **In `service.py`**: Replace `_get_memory_context()` method body. The current method signature is `async def _get_memory_context(self, user_id: str, query: str) -> tuple[str, list[dict]]` (different from context.py's version). It creates its own session via `async with async_session_maker() as session:`. Replace with:
       ```python
       async def _get_memory_context(self, user_id: str, query: str) -> tuple[str, list[dict]]:
           from src.infra.database import async_session_maker
           from src.auth.models import User
           async with async_session_maker() as session:
               user = await session.get(User, user_id)
               profile = user.preferences if user else None
           if profile:
               return f"User profile:\n{profile}", []
           return "", []
       ```
       Remove ALL dynamic imports from `src.memory.*`, `src.embedding.*`.
    2. **Address BOTH call sites**:
       - Call site 1 (~line 313, routing context): `memory_context, self._last_memory_entries = await self._get_memory_context(...)` — now returns user profile text + empty list
       - Call site 2 (~line 598, tool-response context): `memory_context, _ = await self._get_memory_context(...)` — same, user profile text injected into tool messages
    3. **In `prompts.py`**: Update the memory section label from `"Known facts about the user:\n{memory_context}"` to `"User profile:\n{memory_context}"` to accurately reflect the new content.
  - Notes: Supervisor creates its own session (different from context.py which receives session as parameter). Both call sites have the same behavior. The `raw_entries` list is always empty — `MemoryEntrySummary` removal in Task 42 handles the downstream schema. **Remove the `FACT_EXTRACTION_ENABLED` early-exit guard** (currently line ~707: `if not settings.FACT_EXTRACTION_ENABLED: return "", []`). Profile injection is now gated only by `agent.memory_enabled` at the call site in `context.py`, not by this config setting which is being deleted in Task 48.

- [ ] Task 42: Remove admin memory endpoints + memory schemas
  - File: `engine/server/src/admin/user_router.py`
  - Action: Remove `GET /{user_id}/memory` and `DELETE /{user_id}/memory` endpoints. Remove imports from `src.memory.*`.
  - File: `engine/server/src/admin/schemas.py`
  - Action: Remove `from src.memory.schemas import MemoryEntryResponse, MemoryListResponse`.
  - File: `engine/server/src/conversations/schemas.py`
  - Action: Remove `MemoryEntrySummary` class. Change `ContextData.memory_entries` and `SendMessageResponse.memory_entries` fields: either remove them entirely, or replace with `user_profile: str | None` field. If removing, update all code that constructs these response objects.
  - Notes: Admin can manage user profiles via the new preferences API instead. The `memory_entries` field was populated by supervisor — after Task 41 it would always be an empty list. Clean removal is preferred.

- [ ] Task 43: Clean up internal pipelines (memory stats)
  - File: `engine/server/src/internal/pipelines.py`
  - Action:
    1. Remove imports from `src.memory.models` and MemoryEntry queries
    2. Replace memory pipeline stats with RAG stats (query RAGChunk/RAGDocument tables) or remove memory section from monitoring
  - Notes: The hardcoded `"memory:dlq"` strings were already fixed in Task 19 (Phase 5). Verify they use the `DLQ_STREAM` constant.
  - Notes: The DLQ rename (Task 19) changes the constant, but pipelines.py doesn't use the constant — it has hardcoded strings. Fix both.

- [ ] Task 44: Remove memory backfill from CLI
  - File: `engine/server/src/cli.py`
  - Action: Remove the memory section of `backfill-qdrant` command. Remove import of `QdrantMemoryVectorStore`. Keep the RAG/knowledge backfill section if it exists.

- [ ] Task 45: Remove memory pipeline handlers
  - Files to delete: `engine/server/src/pipeline/handlers/extractor.py`, `scorer.py`, `summarizer.py`, `embedder.py`
  - Action: Delete files. Keep `_common.py` (PipelineContext is generic).

- [ ] Task 46: Remove memory module
  - Action: Delete entire `engine/server/src/memory/` directory.
  - File: `engine/server/src/main.py`
  - Action: Remove `from src.memory.router import router as memory_router` and its `app.include_router()` call.

- [ ] Task 47: Remove marathon extraction + memory_entries response chain + Prometheus counters
  - File: `engine/server/src/infra/publish.py` — delete `enqueue_memory_raw()` function
  - File: `engine/server/src/conversations/router.py`:
    1. Remove `_maybe_enqueue_marathon_extraction()` function and its callers (fire-and-forget `asyncio.ensure_future()` calls ~lines 842, 895)
    2. Remove `memory_entries` handling from supervisor response: lines where `memory_entries = result.get("memory_entries", [])` is read and passed to `SendMessageResponse`
    3. Remove import of `memory_extraction_enqueued` metric
  - File: `engine/server/src/infra/metrics.py`:
    1. Remove all 4 memory Prometheus counters: `memory_extraction_enqueued`, `pipeline_facts_extracted`, `pipeline_embeddings_stored`, `pipeline_summaries_stored`
    2. Remove their imports from any files that reference them
  - Notes: `_maybe_enqueue_marathon_extraction` is called via `asyncio.ensure_future()` (fire-and-forget). Any inflight tasks at deploy time may error if `last_memory_extracted_at` column is already dropped — but it's NOT dropped until Task 51, so no race condition.

- [ ] Task 48: Clean up config + embedding resolver + scheduler memory imports + context budget
  - File: `engine/server/src/infra/config.py`
  - Action: Remove all `MEMORY_*`, `FACT_EXTRACTION_*` settings (20+ settings). Remove `CONVERSATION_INDEXING_ENABLED` and `CONVERSATION_INDEX_MODE` (dead after ConversationIndexer deletion). **Rename `CONTEXT_BUDGET_MEMORY_PCT` to `CONTEXT_BUDGET_PROFILE_PCT`** (default 5.0 — reduced from 10.0 since user profile is max 2000 chars vs. dynamic memory retrieval). Do NOT delete it — `build_context_messages()` in `prompt_layers/context.py` reads this setting at line ~78 to allocate budget for the memory/profile layer.
  - File: `engine/server/src/prompt_layers/context.py`
  - Action: Update the reference from `CONTEXT_BUDGET_MEMORY_PCT` to `CONTEXT_BUDGET_PROFILE_PCT` in `build_context_messages()`.
  - File: `engine/server/src/supervisor/service.py`
  - Action: Update the reference from `settings.CONTEXT_BUDGET_MEMORY_PCT` to `settings.CONTEXT_BUDGET_PROFILE_PCT` (~line 156: `_mem_budget = int(_effective_cw * _settings.CONTEXT_BUDGET_MEMORY_PCT / 100)`). Both files read this setting.
  - File: `engine/server/src/embedding/resolver.py`
  - Action: Remove `get_memory_embedding_provider()` function entirely. It reads `MEMORY_EMBEDDING_PROVIDER` and `MEMORY_EMBEDDING_MODEL` settings which are deleted above. All former callers (context.py, supervisor, indexer, search) have been rewritten.
  - File: `engine/server/src/worker/scheduler.py`
  - Action: Remove `from src.memory.router import reload_memory_config` import. Remove entire `memory_consolidation()` function and `memory_extraction_scan()` function. Remove their `scheduler.add_job()` calls. Keep the new `profile_synthesis_scan` (Task 17) and `rag_consolidation` (Task 26) jobs.

- [ ] Task 49: Remove ops memory page, store, and components
  - Files to delete: `apps/ops/src/pages/Memory.tsx`, `apps/ops/src/stores/memory.ts`, entire `apps/ops/src/components/memory/` directory (AFTER knowledge equivalents are done)
  - File: `apps/ops/src/App.tsx` — remove `/ops/memory` route and nav link

- [ ] Task 50: Remove memory model imports from Alembic env
  - File: `engine/server/alembic/env.py`
  - Action: Remove the top-level import `from src.memory.models import MemoryEntry, ConsolidationLog, MemoryEdge` (line ~24). Alembic uses `Base.metadata` for model detection — after the memory module is deleted, these imports would crash ALL Alembic commands (migrate, revision, etc.). The models are no longer needed since the tables are being dropped (Task 53).
  - Notes: CRITICAL — if missed, `alembic revision --autogenerate` and `alembic upgrade head` will fail after memory module deletion.

- [ ] Task 51: Clean up frontend memory types and hooks
  - File: `apps/chat/src/hooks/useChat.ts` — remove `memory_entries` destructuring from `SendMessageResponse` (line ~127) and the mapping to `InsightsMemoryEntry[]` (lines ~142-154)
  - File: `apps/chat/src/hooks/useInsightsPanel.ts` — remove `setMemoryEntries` function and `InsightsMemoryEntry` state
  - File: `packages/ui/src/types/chat.ts` — remove `InsightsMemoryEntry` type definition
  - File: `packages/ui/src/lib/mappers.ts` — remove `mapMemoryEntries` function
  - Notes: After Task 42 removes `MemoryEntrySummary` from the backend, `memory_entries` will always be `[]` or absent. The frontend won't crash (optional chaining) but the dead code should be removed for clarity.

- [ ] Task 52: Final verification — grep for memory imports
  - Action: Run `grep -r "from src.memory" engine/server/src/` and `grep -r "src\.memory" engine/server/src/`. Fix any remaining references. Run `grep -r "memory" apps/ops/src/stores/` to verify no store references remain. Run `grep -r "MemoryEntry" engine/server/src/` to catch schema/model references. Run `grep -r "memory_entries" engine/server/src/ apps/chat/src/ packages/ui/src/` to catch response field references. Run `grep -r "memory:dlq" engine/server/src/` to verify DLQ string cleanup. Run `grep -r "get_memory_embedding" engine/server/src/` to verify resolver cleanup. Run `grep -r "InsightsMemoryEntry" packages/ui/src/ apps/chat/src/` to verify frontend cleanup.
  - Notes: This is the safety net. Every `from src.memory` import, every `MemoryEntry` reference, every `memory:dlq` string, every memory metric, every `InsightsMemoryEntry` type must be gone.

- [ ] Task 53: Create Alembic migration to drop memory tables and columns
  - File: `engine/server/alembic/versions/<new>_drop_memory_tables.py`
  - Action:
    1. Drop `last_memory_extracted_at` from `conversations` table (deferred from Phase 1 for safety)
    2. Drop tables `memory_entries`, `memory_consolidation_logs`, `memory_edges`
  - Notes: Run LAST, after ALL code changes deployed and verified (including Task 50 — alembic/env.py cleanup). Export data first as backup. Must be a SEPARATE deploy from Phase 1 migration — never bundle these.

- [ ] Task 54: Delete Qdrant "memory" collection
  - Action: Via admin script or Qdrant API: delete collection named "memory".
  - Notes: Run after Task 53. Verify no code references remain with `grep -r "memory" engine/server/src/infra/qdrant`.

### Acceptance Criteria

#### User Profile
- [ ] AC 1: Given a user with no preferences, when they type preferences in the config panel and blur, then preferences are saved (max 2000 chars enforced) and visible on next load
- [ ] AC 2: Given a user in conversation says "remember that I prefer Python", then the LLM calls `update_user_profile` and preferences are updated in PG
- [ ] AC 3: Given a user with preferences and an agent with `memory_enabled=true`, when they start a new conversation, then preferences are injected as a single SystemMessage in context
- [ ] AC 4: Given auto-synthesis runs and a user has new conversations, then LLM merges facts into profile (len <= 2000)
- [ ] AC 5: Given auto-synthesis runs and LLM returns garbage/refusal, then existing profile is NOT overwritten
- [ ] AC 6: Given auto-synthesis runs and user has no new conversations, then profile is not modified
- [ ] AC 7: Given an agent with `memory_enabled=false`, when user starts conversation, then user profile is NOT injected into context

#### Conversation Search
- [ ] AC 8: Given past conversations, when LLM calls `conversation_search("postgresql")`, then relevant messages are returned
- [ ] AC 9: Given past conversations, when LLM calls `recent_conversations(3)`, then 3 most recent summaries are returned
- [ ] AC 10: Given user A searches, then only user A's conversations appear (never user B's)
- [ ] AC 11: Given a non-English conversation, when searching with keywords from that conversation, then results are found (thanks to 'simple' dictionary)

#### RAG Pipeline
- [ ] AC 12: Given a document upload, then it flows through extractor -> embedder -> storer and reaches READY status
- [ ] AC 13: Given embedder fails, when retried, then only embedding reruns (chunks already in PG)
- [ ] AC 14: Given `RAG_MULTI_STAGE_ENABLED=false` (default), then old monolithic handler processes documents without error
- [ ] AC 15: Given `RAG_MULTI_STAGE_ENABLED=true`, then new multi-stage pipeline is used

#### RAG Consolidation
- [ ] AC 16: Given two chunks with >95% similarity in same collection, when storer processes them, then duplicate is skipped
- [ ] AC 17: Given a chunk with 0 accesses older than 30 days, when decay runs, then its priority is reduced
- [ ] AC 18: Given duplicate filename upload in same collection, then old document is flagged obsolete

#### UI
- [ ] AC 19: Given admin navigates to `/ops/knowledge`, then top-level tabs appear: Collections, Overview, Explorer, Graph. Collections contains existing scope sub-tabs.
- [ ] AC 20: Given admin clicks Explorer, then paginated chunk table with filters appears
- [ ] AC 21: Given admin clicks Graph, then Sigma visualization of documents/collections appears
- [ ] AC 22: Given `/ops/memory` is accessed, then 404 or redirect (route removed)

#### Cleanup
- [ ] AC 23: Given migration complete, `grep -r "from src.memory" engine/server/src/` and `grep -r "InsightsMemoryEntry" packages/ui/` both return zero results
- [ ] AC 24: Given migration complete, worker starts with no memory stream consumers
- [ ] AC 25: Given conversation compaction triggers, then summary is stored in `Conversation.compaction_summary` (not MemoryEntry)
- [ ] AC 26: Given supervisor routing runs, then user profile is used for context (not MemoryManager)
- [ ] AC 27: Given cleanup complete, all 4 memory Prometheus counters are removed and no `memory:dlq` string literals remain

## Additional Context

### Dependencies

- **No new Python packages** — uses existing deps (SQLAlchemy's `TSVECTOR` type is in `sqlalchemy.dialects.postgresql`, already used for `JSONB`)
- **No new JS packages** — Sigma/Graphology already installed
- **PG**: built-in tsvector with `'simple'` dictionary (no extension needed)
- **Alembic**: 4 migrations: (1) Phase 1 schema + tsvector + backfills (Task 4), (2) RAGChunk access tracking (Task 5), (3) RAGChunk embedding_cache column (Task 21), (4) drop memory tables + last_memory_extracted_at (Task 53). Migration (4) MUST run in a separate deploy from (1)-(3).

### Testing Strategy

**Unit Tests:**
- `test_builtin_tools.py` — each tool handler with mock DB + mock session_maker
- `test_unified_executor.py` — UnifiedToolExecutor dispatches to correct backend
- `test_profile_synthesizer.py` — synthesis with mock LLM, including refusal/error cases
- `test_rag_handlers.py` — each RAG stage independently
- `test_rag_consolidator.py` — decay, obsolescence
- `test_compaction_refactored.py` — compaction using Conversation.compaction_summary

**Integration Tests:**
- RAG pipeline end-to-end: upload -> extract -> embed -> store (with dedup) -> search
- User profile: save -> inject in context -> LLM tool update
- Conversation search: create messages -> tsvector populated via trigger -> search returns results
- Compaction: trigger compaction -> verify summary in Conversation model
- Tool binding: agent_node creates UnifiedToolExecutor -> LLM calls built-in tool -> result returned

**Manual Testing:**
- Config panel preferences save/load
- LLM calls update_user_profile + conversation_search in actual conversation
- Document upload through new pipeline (with feature flag True)
- Knowledge page all tabs (Collections with sub-tabs, Overview, Explorer, Graph)
- Verify Memory page gone (404)
- Verify supervisor routing works with user profile instead of memory
- Verify agents with memory_enabled=false don't get profile injection

### Deployment Notes

**Migration Ordering (CRITICAL):**

This spec spans multiple deploys. Phases must be deployed in order with migrations running at the correct time:

1. **Deploy 1**: Phase 1 migration (Tasks 1-5). Safe to run with existing code — only ADDS columns/indexes. `last_memory_extracted_at` is NOT dropped. Old code continues to function normally.

2. **Deploy 2**: Phases 2-8 code changes (Tasks 6-37). New features go live. Old memory code still works in parallel until Phase 9.

3. **Deploy 3**: Phase 9 code cleanup (Tasks 38-52). All memory imports removed. Memory code deleted. Old memory stream consumers removed from worker. Alembic env.py cleaned. Frontend memory types cleaned.

4. **Deploy 4**: Phase 9 migration (Task 53). Drop memory tables + `last_memory_extracted_at` column. Run ONLY after Deploy 3 is verified stable.

5. **Deploy 5**: Task 54 — delete Qdrant "memory" collection. Manual step after all code is clean.

**DLQ Drain**: Before Deploy 2 (Task 19), drain existing `memory:dlq` messages. After rename to `pipeline:dlq`, the old stream is orphaned.

**Feature Flag**: `RAG_MULTI_STAGE_ENABLED` defaults to `False`. After Deploy 2, manually set to `True` and monitor document processing. If issues arise, set back to `False` for instant rollback. **Before toggling**: wait for all in-progress documents to reach READY status to avoid orphaned state.

**Consumer Groups**: Task 24 changes the consumer group for `tasks:documents` from `"doc-processors"` to `"rag-extractors"`. Any pending messages in the old group become orphaned. Before enabling the feature flag, verify no pending messages exist in the old consumer group (`XPENDING tasks:documents doc-processors`).

**Backup**: Export `memory_entries`, `memory_consolidation_logs`, `memory_edges` table data before Deploy 4.

### Notes

**High-Risk Items:**
- **CompactionService refactoring** (Task 38): Critical path — compaction runs during active conversations. Test thoroughly.
- **Tool binding architecture** (Task 14): Central integration point for all 3 built-in tools. User_id must flow correctly through state.metadata. Edge case: if user_id is None (non-standard graph invocation), builtin tools should gracefully fail, not crash.
- **Supervisor context** (Task 41): Used in production routing with two distinct call sites (routing + tool-response). Verify supervisor still routes correctly with user profile instead of memory.
- **DLQ rename** (Task 19): Affects all consumers. Drain old DLQ + fix hardcoded strings in pipelines.py in the SAME deploy.
- **Migration ordering** (Deploy 1 vs Deploy 4): Dropping `last_memory_extracted_at` too early causes runtime errors. See Deployment Notes.
- **In-flight documents during feature flag toggle**: If `RAG_MULTI_STAGE_ENABLED` is toggled from False to True while a document is being processed by the old monolithic handler, the document may end up in an inconsistent state. Mitigation: wait for all in-progress documents to reach READY status before toggling.

**Known Limitations:**
- Conversation search uses `'simple'` tsvector (no stemming). Better for multilingual but less precise for English-only deployments.
- User profile is unstructured text (max 2000 chars). LLM must parse and update correctly.
- Auto-synthesis batched at 20 users per `asyncio.gather()`, 100 users max per cron run.
- Knowledge graph is document-level only (chunks not shown for performance).
- `memory_enabled` flag now gates profile injection — semantically overloaded but avoids DB migration for field rename.
- `RAG_MULTI_STAGE_ENABLED` defaults to False — must be manually enabled after verification.
- `trace:memory` SSE event in `executions/service.py` will emit an empty `memory_entries` list after migration. The event can be repurposed for user profile data or removed in a future cleanup. Not a breaking change (frontend handles empty list).

**Future Considerations (out of scope):**
- Semantic conversation search (hybrid tsvector + embedding)
- Structured user profile (JSON schema)
- Per-project user profiles
- RAG enricher/scorer stages
- Chunk-level graph visualization
- Rename `memory_enabled` to `profile_enabled` on AgentConfig (requires Platform schema sync)
