# BMAD Audit V2 — Clean Code, Duplications & Dead Code

**Date**: 2026-03-05
**Scope**: Full codebase (apps/, packages/, engine/, shared/, platform/)
**Status**: REMEDIATED

---

## Executive Summary

| Category | Issues | Resolved | Deferred |
|----------|--------|----------|----------|
| 1. Type/Interface Duplications (TS) | 8 | 8 | 0 |
| 2. Hook/Logic Duplications (TS) | 3 | 3 | 0 |
| 3. Schema/Model Duplications (Python) | 4 | 3 | 1 |
| 4. Dead Code & Stubs | 3 | 0 | 3 |
| 5. Clean Code Violations | 6 | 5 | 1 |
| **Total** | **24** | **19** | **5** |

---

## Remediation Log

### Phase 1 — Quick Wins ✅

| # | Issue | Status | Details |
|---|-------|--------|---------|
| 1.1 | PaginatedResponse redefined in 3 platform stores | ✅ Done | Renamed to `PaginatedAgentResponse`, `PaginatedClientResponse`, `PaginatedEngineResponse` with doc comments |
| 1.7 | MCPToolResponse vs MCPToolDefinition | ✅ Done | `MCPToolResponse = MCPToolDefinition` alias in `mcp/usage_router.py`, import from `mcp/schemas.py` |
| 1.8 | MemoryListResponse defined twice | ✅ Done | Admin now imports from `src.memory.schemas`, removed local alias |
| 3.1 | ActionResponse duplicated | ✅ Done | `internal/actions.py` extends `_BaseActionResponse` from `infra/schemas.py` |
| 5.1 | Silent ANTI_FOUC_SCRIPT catch | ✅ Done | Added `console.warn("[mm-theme]", e)` in catch block |
| 5.3 | `any` type in fa2LayoutRef | ✅ Done | Typed as `InstanceType<NonNullable<typeof FA2LayoutWorkerCls>>` |

### Phase 2 — Type Centralization ✅

| # | Issue | Status | Details |
|---|-------|--------|---------|
| 1.2 | TokenUsage duplicated | ✅ Done | Moved to `@modularmind/ui/types/chat.ts`, both hooks import from there |
| 1.3 | ExecutionOutput/OutputData duplicated | ✅ Done | Created `ExecutionOutputData` in `@modularmind/ui/types/chat.ts` |
| 1.4 | SendMessageResponse missing context_data | ✅ Done | Added `context_data` to `api-client/types/conversations.ts`; platform keeps local definition (doesn't depend on api-client) |
| 1.5 | EngineAgent/Graph/Model duplicated | ✅ Done | Created `api-client/types/engine.ts` + `ui/types/engine.ts` (re-export for platform); both hooks import from packages |
| 1.6 | ContextHistory/Budget types not shared | ✅ Done | Added 9 types to `@modularmind/ui/types/chat.ts`: `ContextHistoryMessage`, `ContextHistoryBudget`, `ContextHistory`, `BudgetLayerInfo`, `BudgetOverview`, `ContextData`, `MessageExecutionData` |

### Phase 3 — Python Schema Consolidation ✅

| # | Issue | Status | Details |
|---|-------|--------|---------|
| 3.2 | ModelResponse duplicated | ✅ Done | Created `models/schemas.py` with unified 18-field `ModelResponse`; both routers import from there |
| 3.3 | Schemas inside router files | ✅ Done | Created `internal/schemas.py` (22 schemas from monitoring + pipelines), `connectors/schemas.py` (5 schemas); routers now import from schema files |
| 3.4 | Enums coupled to models | ⏳ Deferred | Current pattern works; low priority |

### Phase 4 — Hook Deduplication ✅

| # | Issue | Status | Details |
|---|-------|--------|---------|
| 2.1 | useExecutionActivities duplicated | ✅ Done | Moved to `@modularmind/ui/hooks/useExecutionActivities.ts` (~327 lines); both apps now thin re-exports (~5 lines each) |
| 5.2 | `any` type in platform useExecutionActivities | ✅ Done | Resolved by dedup — shared hook uses `Record<string, unknown>` |
| 2.2 | useChat shared core (extractResponse) | ✅ Done | Extracted `extractResponse()` to `@modularmind/ui/hooks/useChatUtils.ts`; both hooks import from there |
| 2.3 | useChatConfig type duplication | ✅ Done | Both hooks import types from packages; fetch logic stays local (different APIs) |

### Phase 5 — Component Decomposition ✅

| # | Issue | Status | Details |
|---|-------|--------|---------|
| 5.4a | platform InsightsPanel (1083 lines) | ✅ Done | Split into 4 sub-components: `ConfigTab` (241), `ActivityTab` (168), `MemoryTab` (330), `KnowledgeTab` (120); parent reduced to 184 lines |
| 5.4b | ops MemoryConfigTab (1020 lines) | ✅ Done | Split into 6 files: `types.ts`, `shared.tsx`, `ExtractionConfig`, `DecayConfig`, `ScoringConfig`, `ConsolidationConfig`; parent reduced to 384 lines |
| 5.4c | ops PipelinesTab (581 lines) | ✅ Done | Split into 3 sub-components: `MemoryPipelineSection` (155), `KnowledgePipelineSection` (163), `DLQSection` (87); parent reduced to 183 lines |

---

## Files Changed

### Created (TypeScript)
- `packages/ui/src/types/engine.ts` — EngineAgent, EngineGraph, EngineModel, McpServer, SupervisorLayer
- `packages/ui/src/hooks/useExecutionActivities.ts` — Canonical shared hook (~327 lines)
- `packages/ui/src/hooks/useChatUtils.ts` — `extractResponse()` utility
- `packages/api-client/src/types/engine.ts` — Engine config types (canonical source)
- `platform/src/components/chat/insights/ConfigTab.tsx` — Config sub-component
- `platform/src/components/chat/insights/ActivityTab.tsx` — Activity sub-component
- `platform/src/components/chat/insights/MemoryTab.tsx` — Memory sub-component
- `platform/src/components/chat/insights/KnowledgeTab.tsx` — Knowledge sub-component
- `apps/ops/src/components/configuration/memory-config/types.ts` — Shared config types
- `apps/ops/src/components/configuration/memory-config/shared.tsx` — Reusable field components
- `apps/ops/src/components/configuration/memory-config/ExtractionConfig.tsx`
- `apps/ops/src/components/configuration/memory-config/DecayConfig.tsx`
- `apps/ops/src/components/configuration/memory-config/ScoringConfig.tsx`
- `apps/ops/src/components/configuration/memory-config/ConsolidationConfig.tsx`
- `apps/ops/src/components/monitoring/pipelines/MemoryPipelineSection.tsx`
- `apps/ops/src/components/monitoring/pipelines/KnowledgePipelineSection.tsx`
- `apps/ops/src/components/monitoring/pipelines/DLQSection.tsx`

### Created (Python)
- `engine/server/src/models/schemas.py` — Unified ModelResponse, PullRequest, PullResponse
- `engine/server/src/internal/schemas.py` — 22 schemas from monitoring + pipelines
- `engine/server/src/connectors/schemas.py` — 5 connector schemas

### Modified (TypeScript)
- `packages/ui/src/index.ts` — Added engine types, useExecutionActivities, extractResponse exports
- `packages/ui/src/types/chat.ts` — Added TokenUsage, ExecutionOutputData, Context/Budget types
- `packages/ui/src/theme/utils.ts` — Added console.warn to FOUC catch
- `packages/api-client/src/index.ts` — Added engine types export
- `packages/api-client/src/types/conversations.ts` — Added context_data to SendMessageResponse
- `apps/chat/src/hooks/useChat.ts` — Imports TokenUsage + extractResponse from @modularmind/ui
- `apps/chat/src/hooks/useExecutionActivities.ts` — Thin re-export from @modularmind/ui
- `apps/chat/src/hooks/useChatConfig.ts` — Imports types from @modularmind/api-client
- `platform/src/hooks/useChat.ts` — Imports types from @modularmind/ui, local SendMessageResponse
- `platform/src/hooks/useExecutionActivities.ts` — Thin re-export from @modularmind/ui
- `platform/src/hooks/useChatConfig.ts` — Imports types from @modularmind/ui
- `platform/src/components/chat/InsightsPanel.tsx` — Reduced from 1083 to 184 lines
- `platform/src/stores/agents.ts` — PaginatedAgentResponse
- `platform/src/stores/clients.ts` — PaginatedClientResponse
- `platform/src/stores/engines.ts` — PaginatedEngineResponse
- `apps/ops/src/components/configuration/MemoryConfigTab.tsx` — Reduced from 1020 to 384 lines
- `apps/ops/src/components/monitoring/PipelinesTab.tsx` — Reduced from 581 to 183 lines
- `apps/ops/src/components/memory/MemoryGraphTab.tsx` — Typed fa2LayoutRef

### Modified (Python)
- `engine/server/src/admin/schemas.py` — Imports MemoryListResponse from memory
- `engine/server/src/mcp/usage_router.py` — MCPToolResponse alias from schemas
- `engine/server/src/internal/actions.py` — ActionResponse extends infra base
- `engine/server/src/internal/monitoring.py` — Imports schemas from internal/schemas
- `engine/server/src/internal/pipelines.py` — Imports schemas from internal/schemas
- `engine/server/src/internal/alerts.py` — Imports AlertItem from internal/schemas
- `engine/server/src/models/router.py` — Imports from models/schemas
- `engine/server/src/models/usage_router.py` — Imports ModelResponse from models/schemas
- `engine/server/src/connectors/router.py` — Imports from connectors/schemas

---

## Type-Check Results

| Package | Status |
|---------|--------|
| `@modularmind/api-client` | ✅ Clean |
| `@modularmind/ui` | ✅ Clean |
| `@modularmind/chat` | ✅ Clean |
| `@modularmind/ops` | ✅ Clean |
| `platform` | ✅ Clean (only pre-existing Prisma typing issues in API routes) |

---

## Deferred Items

| # | Item | Reason |
|---|------|--------|
| 3.4 | Enums coupled to SQLAlchemy models | Low priority — current pattern works fine |
| 4.1 | pipeline/consumer.py stub | Feature implementation — not a code quality issue |
| 4.2 | Conversation compaction TODO | Feature implementation — not a code quality issue |
| 4.3 | Memory consolidation TODO | Feature implementation — not a code quality issue |
| 5.5 | `dict[str, Any]` in Python schemas | Low priority — these fields are genuinely dynamic |
| 5.6 | Setup page stub | Feature implementation |

---

## Positive Observations

- No hardcoded Tailwind colors — all semantic tokens
- No `console.log` debugging leftovers in production code
- No security vulnerabilities detected
- No deep nesting (max 3 levels) across entire codebase
- No unused exports or dead files (besides planned stubs)
- All Zustand stores actively used
- All hooks actively consumed
- Python logging consistently structured
- Clean git history with conventional commits
