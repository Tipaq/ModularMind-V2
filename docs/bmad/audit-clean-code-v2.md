# BMAD Audit V2 — Clean Code, Duplications & Dead Code

**Date**: 2026-03-05
**Scope**: Full codebase (apps/, packages/, engine/, shared/, platform/)
**Status**: AUDIT COMPLETE — awaiting remediation

---

## Executive Summary

| Category | Issues | High | Medium | Low |
|----------|--------|------|--------|-----|
| 1. Type/Interface Duplications (TS) | 8 | 3 | 4 | 1 |
| 2. Hook/Logic Duplications (TS) | 3 | 1 | 2 | 0 |
| 3. Schema/Model Duplications (Python) | 4 | 1 | 3 | 0 |
| 4. Dead Code & Stubs | 3 | 0 | 1 | 2 |
| 5. Clean Code Violations | 6 | 1 | 3 | 2 |
| **Total** | **24** | **6** | **13** | **5** |

---

## Category 1 — TypeScript Type/Interface Duplications

### 1.1 PaginatedResponse redefined in 3 platform stores [HIGH]

The generic `PaginatedResponse<T>` exists in `@modularmind/api-client` but is redefined locally in 3 platform stores (platform doesn't depend on api-client).

| File | Line | Type |
|------|------|------|
| `platform/src/stores/agents.ts` | 31-36 | `PaginatedResponse` (non-generic, items: PlatformAgent[]) |
| `platform/src/stores/clients.ts` | 30-35 | `PaginatedResponse` (non-generic, items: PlatformClient[]) |
| `platform/src/stores/engines.ts` | 19-24 | `PaginatedResponse` (non-generic, items: PlatformEngineListItem[]) |

**Note**: `graphs.ts` was already renamed to `PaginatedGraphResponse` in previous audit. Same treatment needed for the other 3.

**Fix**: Rename each to `Paginated<Domain>Response` with a comment, or create a shared generic in platform's own `lib/types.ts`.

---

### 1.2 TokenUsage duplicated in chat and platform useChat [MEDIUM]

Identical `TokenUsage` interface defined in two hooks:

| File | Line | Fields |
|------|------|--------|
| `apps/chat/src/hooks/useChat.ts` | 19-23 | `prompt, completion, total` |
| `platform/src/hooks/useChat.ts` | 16-20 | `prompt, completion, total` |

Different from api-client's `TokenUsage` (snake_case: `prompt_tokens`, `completion_tokens`, `total_tokens`).

**Fix**: Move camelCase `TokenUsage` to `@modularmind/ui/types/chat.ts` and import from both hooks.

---

### 1.3 ExecutionOutput / OutputData duplicated [MEDIUM]

Identical interface for parsing execution SSE output, defined separately:

| File | Line | Name |
|------|------|------|
| `apps/chat/src/hooks/useChat.ts` | 25-29 | `ExecutionOutput` |
| `platform/src/hooks/useChat.ts` | 110-114 | `OutputData` |

Both have identical fields: `response?`, `messages?`, `node_outputs?`.

**Fix**: Extract to `@modularmind/ui/types/chat.ts` as `ExecutionOutputData`.

---

### 1.4 SendMessageResponse redefined in platform useChat [HIGH]

The api-client defines `SendMessageResponse` (17 fields), but platform's `useChat.ts` redefines it locally with inline nested types and extra `context_data` structure (lines 74-108, 35 lines of inline types).

| File | Line |
|------|------|
| `packages/api-client/src/types/conversations.ts` | 105-117 |
| `platform/src/hooks/useChat.ts` | 74-108 |

**Fix**: Extend api-client's `SendMessageResponse` with `context_data` via intersection type, or add `context_data` to the api-client type.

---

### 1.5 EngineAgent / EngineGraph / EngineModel duplicated [HIGH]

Config types for engine resources defined in both chat and platform hooks:

| File | Types |
|------|-------|
| `apps/chat/src/hooks/useChatConfig.ts:4-31` | `EngineAgent`, `EngineGraph`, `EngineModel` |
| `platform/src/hooks/useChatConfig.ts:5-48` | `EngineAgent`, `EngineGraph`, `EngineModel` + `McpServer`, `SupervisorLayer` |

Platform's `EngineModel` includes extra `context_window: number | null` field.

**Fix**: Move to `@modularmind/api-client/types/engine.ts` as the canonical source. Platform can extend with extra fields.

---

### 1.6 ContextHistory/Budget types not shared [MEDIUM]

7 types defined only in platform's useChat (lines 22-72) that represent important domain concepts:

`ContextHistoryMessage`, `ContextHistoryBudget`, `ContextHistory`, `BudgetLayerInfo`, `BudgetOverview`, `ContextData`, `MessageExecutionData`

Currently only used by platform but could be needed by chat app if context budget features are added there.

**Fix**: Move to `@modularmind/ui/types/chat.ts` proactively.

---

### 1.7 MCPToolResponse vs MCPToolDefinition [MEDIUM]

Nearly identical schemas in two Python files (also affects TS consumers):

| File | Line | Name |
|------|------|------|
| `engine/server/src/mcp/schemas.py` | 34-39 | `MCPToolDefinition` |
| `engine/server/src/mcp/usage_router.py` | 23-26 | `MCPToolResponse` |

Same fields: `name`, `description`, `input_schema`. The usage_router even has a comment acknowledging this: `# --- Schemas (shared with router.py) ---`

**Fix**: Import `MCPToolDefinition` from `schemas.py` in `usage_router.py` and alias as `MCPToolResponse = MCPToolDefinition`.

---

### 1.8 MemoryListResponse defined twice in Python [LOW]

| File | Line | Style |
|------|------|-------|
| `engine/server/src/memory/schemas.py` | 36 | `class MemoryListResponse(PaginatedResponse[MemoryEntryResponse]): pass` |
| `engine/server/src/admin/schemas.py` | 114 | `MemoryListResponse = PaginatedResponse[MemoryEntryResponse]` |

Same type, two definitions. Admin should import from memory.

**Fix**: `from src.memory.schemas import MemoryListResponse` in admin/schemas.py.

---

## Category 2 — Hook/Logic Duplications

### 2.1 useExecutionActivities duplicated (326 vs 327 lines) [HIGH]

Nearly identical hook in both apps with one key difference:

| File | Lines | Event typing |
|------|-------|-------------|
| `apps/chat/src/hooks/useExecutionActivities.ts` | 326 | `SSETraceEvent` (typed union from api-client) |
| `platform/src/hooks/useExecutionActivities.ts` | 327 | `Record<string, any>` (permissive, eslint-disabled) |

The logic (truncate, completeLastRunning, all event handlers) is identical.

**Fix**: Move the hook to `@modularmind/ui` or a shared hooks package. Use the typed version from chat as the canonical implementation.

---

### 2.2 useChat duplicated (345 vs 590 lines) [MEDIUM]

Both apps have `useChat` hooks with shared core logic (SSE streaming, message handling, `extractResponse()`) but platform's version adds context budget tracking.

| File | Lines | Extra features |
|------|-------|---------------|
| `apps/chat/src/hooks/useChat.ts` | 345 | Base SSE + insights |
| `platform/src/hooks/useChat.ts` | 590 | + context budget, activity tracking, more inline types |

**Fix**: Extract shared core (`extractResponse`, SSE connection, message state) to a shared hook. App-specific extensions stay local.

---

### 2.3 useChatConfig duplicated [MEDIUM]

Both apps have `useChatConfig` hooks with identical fetch logic:

| File | Lines |
|------|-------|
| `apps/chat/src/hooks/useChatConfig.ts` | ~80 |
| `platform/src/hooks/useChatConfig.ts` | ~100 |

Same pattern: fetch agents, graphs, models in parallel. Platform adds MCP servers and supervisor layers.

**Fix**: Extract shared fetch logic to a configurable shared hook. Pass resource list as config.

---

## Category 3 — Python Schema/Model Duplications

### 3.1 ActionResponse duplicated (infra vs internal) [MEDIUM]

| File | Line | Fields |
|------|------|--------|
| `engine/server/src/infra/schemas.py` | 41-44 | `status` |
| `engine/server/src/internal/actions.py` | 20-23 | `status`, `message`, `details` |

The internal version extends the base but redefines instead of inheriting.

**Fix**: `class ActionResponse(InfraActionResponse)` with `message` and `details` fields, or extend the base with optional fields.

---

### 3.2 ModelResponse duplicated (router vs usage_router) [MEDIUM]

| File | Line | Fields |
|------|------|--------|
| `engine/server/src/models/router.py` | 22-36 | 14 fields (basic) |
| `engine/server/src/models/usage_router.py` | 27-45 | 16 fields (+ parameter_size, disk_size, quantization, family) |

**Fix**: Keep the extended version in a shared `models/schemas.py`, import from both routers.

---

### 3.3 Schemas defined inside router files [MEDIUM]

Multiple routers define Pydantic schemas inline instead of in dedicated schema files:

| Module | Schemas in router | Lines |
|--------|-------------------|-------|
| `connectors/router.py` | ConnectorCreate, ConnectorUpdate, ConnectorResponse, etc. | 38-82 |
| `models/router.py` | ModelResponse, PullRequest, PullResponse | 22-52 |
| `models/usage_router.py` | ModelResponse, CatalogModelResponse, etc. | 27-90 |
| `mcp/usage_router.py` | MCPToolResponse, MCPToolCallRequestBody, etc. | 23-36 |
| `internal/actions.py` | ActionResponse, PurgeRequest, DlqRetryRequest | 20-33 |
| `internal/monitoring.py` | 11 schemas (GPUInfo, System/Streaming/Scheduler/InfraMonitoring, etc.) | 47-149 |
| `internal/pipelines.py` | 9 schemas (StreamGroupInfo, DLQMessage, PipelinesResponse, etc.) | 25-90 |

**Fix**: Create dedicated schema files (`models/schemas.py`, `internal/schemas.py`) and move schemas there. Router files should only contain route handlers.

---

### 3.4 Enums coupled to SQLAlchemy models [LOW — deferred]

All domain enums (`ExecutionStatus`, `MemoryScope`, `MemoryTier`, `MemoryType`, `UserRole`, `MessageRole`, etc.) are defined inside SQLAlchemy model files, forcing schema files to import from models.

**Fix (optional)**: Move enums to `infra/enums.py` and import from both models and schemas. Low priority — current pattern works.

---

## Category 4 — Dead Code & Stubs

### 4.1 pipeline/consumer.py is a stub [MEDIUM]

File contains only a docstring and TODO comment (13 lines). No implementation.

```python
# TODO: Implement consumer that:
# - Creates consumer groups for 'memory:raw' and 'memory:extracted'
# - Dispatches events to extractor and embedder handlers
# - Handles errors with retry + DLQ
# - Runs as an asyncio task within the worker process
```

**Fix**: Either implement or remove and track in project backlog.

---

### 4.2 Conversation compaction TODO [LOW]

Empty callback in two files:

| File | Line |
|------|------|
| `apps/chat/src/pages/Chat.tsx` | 286 |
| `platform/src/app/(studio)/chat/page.tsx` | 398 |

```tsx
onCompact={() => {/* TODO: implement conversation compaction */}}
```

**Fix**: Implement or remove the button/prop.

---

### 4.3 Memory consolidation TODO [LOW]

```python
# engine/server/src/worker/scheduler.py:169
# TODO: Implement MemoryConsolidator.consolidate_scope() and promote_episodic_to_semantic()
```

**Fix**: Implement or document as planned feature in roadmap.

---

## Category 5 — Clean Code Violations

### 5.1 Silent catch in ANTI_FOUC_SCRIPT [HIGH]

```javascript
// packages/ui/src/theme/utils.ts:59
} catch(e) {}
```

Empty catch in the anti-FOUC inline script. Theme initialization errors are silently swallowed.

**Fix**: Add `console.warn("Theme init error:", e)` or at minimum ensure graceful degradation is documented.

---

### 5.2 `any` type in useExecutionActivities (platform) [MEDIUM]

```typescript
// platform/src/hooks/useExecutionActivities.ts:55
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleEvent = useCallback((data: Record<string, any>) => {
```

Chat version uses typed `SSETraceEvent`. Platform bypasses with `any`.

**Fix**: Use the same typed event union. Will be resolved by deduplicating the hook (2.1).

---

### 5.3 `any` type in MemoryGraphTab layout ref [MEDIUM]

```typescript
// apps/ops/src/components/memory/MemoryGraphTab.tsx:66
const fa2LayoutRef = useRef<any>(null);
```

**Fix**: Type as `ReturnType<typeof import("graphology-layout-forceatlas2/worker").default> | null` or create a type alias.

---

### 5.4 Large components needing decomposition [MEDIUM]

| Component | Lines | Recommendation |
|-----------|-------|---------------|
| `platform/src/components/chat/InsightsPanel.tsx` | 1083 | Split into SupervisorTab, KnowledgeTab, MemoryTab, ContextTab, ConfigTab sub-components |
| `apps/ops/src/components/configuration/MemoryConfigTab.tsx` | 1020 | Split into DecayConfig, ExtractionConfig, ScoringConfig sections |
| `apps/ops/src/components/monitoring/PipelinesTab.tsx` | 581 | Split into MemoryPipeline, KnowledgePipeline, DLQ sub-components |
| `apps/ops/src/components/memory/ConsolidationTab.tsx` | 461 | Split into ConsolidationControl and ConsolidationLog |

---

### 5.5 `dict[str, Any]` overuse in Python schemas [LOW]

Several Python schemas use untyped `dict` where a TypedDict or nested Pydantic model would be better:

| File | Field |
|------|-------|
| `conversations/schemas.py:37` | `config: dict[str, Any]` |
| `conversations/schemas.py:45` | `metadata: dict[str, Any]` |
| `executions/schemas.py:42-43` | `input_data/output_data: dict[str, Any]` |
| `connectors/router.py:44` | `config: dict` |
| `memory/schemas.py:29` | `metadata: dict` |

**Fix**: Define TypedDict or Pydantic models for common config/metadata shapes. Low priority — these are genuinely dynamic in some cases.

---

### 5.6 Setup page stub [LOW]

```tsx
// apps/ops/src/pages/Setup.tsx:5
{/* TODO: First-run setup wizard */}
```

**Fix**: Implement or remove from navigation.

---

## Positive Observations

- No hardcoded Tailwind colors found — all semantic tokens
- No `console.log` debugging leftovers in production code
- No security vulnerabilities detected (no eval, no dangerouslySetInnerHTML abuse, no hardcoded secrets)
- No deep nesting (max 3 levels) across entire codebase
- No unused exports or dead files (besides the stub)
- All Zustand stores actively used
- All hooks actively consumed
- Python logging is consistently structured with `logger.exception()` / `logger.error()`
- Proper `from_attributes` / `populate_by_name` on all Pydantic response models
- Clean git history with conventional commits

---

## Remediation Plan

### Phase 1 — Quick Wins (low risk, high impact)

| # | Task | Issues | Effort |
|---|------|--------|--------|
| A | Rename 3 platform PaginatedResponse → domain-specific names | 1.1 | 5 min |
| B | Import MemoryListResponse in admin from memory/schemas | 1.8 | 2 min |
| C | Import MCPToolDefinition in usage_router from schemas | 1.7 | 2 min |
| D | Extend ActionResponse from infra base in internal/actions | 3.1 | 5 min |
| E | Add console.warn to ANTI_FOUC_SCRIPT catch block | 5.1 | 2 min |
| F | Type fa2LayoutRef properly in MemoryGraphTab | 5.3 | 2 min |

### Phase 2 — Type Centralization (medium risk)

| # | Task | Issues | Effort |
|---|------|--------|--------|
| G | Move TokenUsage + ExecutionOutputData to @modularmind/ui | 1.2, 1.3 | 15 min |
| H | Move EngineAgent/Graph/Model to @modularmind/api-client | 1.5 | 20 min |
| I | Add context_data to api-client SendMessageResponse | 1.4 | 10 min |
| J | Move ContextHistory/Budget types to @modularmind/ui | 1.6 | 10 min |
| K | Consolidate ModelResponse into models/schemas.py | 3.2 | 10 min |
| L | Move router-embedded schemas to schema files | 3.3 | 30 min |

### Phase 3 — Hook Deduplication (medium-high risk)

| # | Task | Issues | Effort |
|---|------|--------|--------|
| M | Move useExecutionActivities to shared package | 2.1, 5.2 | 30 min |
| N | Extract shared useChat core logic | 2.2 | 45 min |
| O | Extract shared useChatConfig | 2.3 | 20 min |

### Phase 4 — Component Decomposition (low risk)

| # | Task | Issues | Effort |
|---|------|--------|--------|
| P | Split platform InsightsPanel (1083 lines) | 5.4 | 45 min |
| Q | Split MemoryConfigTab (1020 lines) | 5.4 | 30 min |
| R | Split PipelinesTab (581 lines) | 5.4 | 20 min |

### Phase 5 — Backlog (low priority)

| # | Task | Issues |
|---|------|--------|
| S | Implement or remove pipeline/consumer.py stub | 4.1 |
| T | Implement or remove conversation compaction | 4.2 |
| U | Implement or remove memory consolidation | 4.3 |
| V | Type Python config/metadata dicts | 5.5 |
| W | Implement or remove Setup page | 5.6 |
| X | Move enums to infra/enums.py | 3.4 |
