# BMAD Audit V5 — Clean Code, Duplications & Dead Code

**Date**: 2026-03-05
**Scope**: Full codebase (apps/, packages/, engine/, shared/, platform/)
**Status**: AUDIT COMPLETE — PENDING REMEDIATION

---

## Executive Summary

| Category | Issues | Actionable | Deferred/Acceptable |
|----------|--------|------------|---------------------|
| 1. Component/Hook Duplications (TS) | 5 | 3 | 2 |
| 2. Type/Interface Duplications (TS) | 2 | 2 | 0 |
| 3. Utility Duplications (TS + Python) | 3 | 3 | 0 |
| 4. Inline Schemas in Router Files (Python) | 7 | 7 | 0 |
| 5. Dead/Unused Code | 1 | 1 | 0 |
| 6. Constants Scattered | 1 | 1 | 0 |
| **Total** | **19** | **17** | **2** |

**Overall grade: A-** — Convention compliance is excellent (0 violations). Remaining issues are structural duplications from the parallel chat/platform implementations.

---

## V4 Actionable Items Status

| # | Item | Status |
|---|------|--------|
| ConsolidationLog duplicate in ops store | ✅ Resolved — now imports from `@modularmind/api-client` |
| auto_retrain.py dead code | ⚠️ Still present — `AutoRetrainChecker` defined but never instantiated (see §5.1) |

---

## 1. Component/Hook Duplications (TypeScript)

### 1.1 ChatInput — near-identical in both apps (HIGH)

**Files**:
- `apps/chat/src/components/ChatInput.tsx` (572 lines)
- `platform/src/components/chat/ChatInput.tsx` (567 lines)

99% structurally identical. Shared helpers (`ContextMiniDonut`, `formatFileSize`) are copy-pasted. Differences:
- chat app wraps in `React.memo`, platform doesn't
- chat app supports `modelLabel` prop, platform doesn't
- Model ID passed to `onModelChange` differs: `m.id` (chat) vs `${m.provider}:${m.model_id}` (platform)
- chat uses `MAX_TEXTAREA_HEIGHT` constant, platform hardcodes `200`

**Recommendation**: Move to `@modularmind/ui` with a `modelIdFormat` config prop (or let parent format). Extract `ContextMiniDonut` and `formatFileSize` as shared utilities.

### 1.2 InsightsPanel — divergent structure (MEDIUM)

**Files**:
- `apps/chat/src/components/InsightsPanel.tsx` (552 lines — monolithic)
- `platform/src/components/chat/InsightsPanel.tsx` (192 lines — delegates to sub-components)

Different tab sets ("routing" vs "activity"), different data models (`panelState` vs `executionDataMap`). Not a candidate for full consolidation, but shared helpers are duplicated:
- `formatTokenCount` — identical to `formatTokens` in `@modularmind/ui/lib/utils.ts`
- `scoreTextColor` / `scoreBgColor` — could be shared utilities

**Recommendation**: Import `formatTokens` from `@modularmind/ui` instead of local re-implementation. Extract score color utilities to `@modularmind/ui`.

### 1.3 useChat — parallel implementations (MEDIUM)

**Files**:
- `apps/chat/src/hooks/useChat.ts` (317 lines)
- `platform/src/hooks/useChat.ts` (527 lines)

Same SSE event handling core with different state management. Platform adds localStorage persistence, execution data maps, and more complex lifecycle. Not a consolidation candidate — but SSE parsing logic could be extracted.

**Recommendation**: Extract common SSE event parsing into `@modularmind/ui/hooks/useChatUtils.ts` (which already exists for `extractResponse`).

### 1.4 useChatConfig — load pattern duplication (LOW)

**Files**:
- `apps/chat/src/hooks/useChatConfig.ts` (77 lines)
- `platform/src/hooks/useChatConfig.ts` (128 lines)

Same `loadedRef`/`loadingRef` guard pattern, same `Promise.all()` parallel loading. Different endpoints (engine API vs platform proxy).

**Recommendation**: ⏳ Acceptable — different APIs make consolidation add indirection without real benefit.

### 1.5 ChatMessages / useExecutionActivities re-exports (LOW)

**Files**:
- `apps/chat/src/components/ChatMessages.tsx` — pure re-export from `@modularmind/ui`
- `platform/src/components/chat/ChatMessages.tsx` — pure re-export from `@modularmind/ui`
- `apps/chat/src/hooks/useExecutionActivities.ts` — pure re-export
- `platform/src/hooks/useExecutionActivities.ts` — pure re-export

**Recommendation**: ⏳ Acceptable — thin re-exports enable local path consistency. Low-priority cleanup.

---

## 2. Type/Interface Duplications (TypeScript)

### 2.1 CatalogModel — stripped-down copy in ops (MEDIUM)

**Files**:
- `packages/api-client/src/types/models.ts` — canonical (21 fields, typed enums)
- `apps/ops/src/components/configuration/memory-config/types.ts` — local copy (10 fields, `string` types)

Ops version uses `string` instead of `ModelProvider`/`PullStatus` enums and drops 11 fields.

**Recommendation**: Import `CatalogModel` from `@modularmind/api-client`. Use `Pick<CatalogModel, 'id' | 'provider' | ...>` if only a subset is needed.

### 2.2 formatFileSize re-implementation (LOW)

**Files**:
- `apps/chat/src/components/ChatInput.tsx:95-99`
- `platform/src/components/chat/ChatInput.tsx:95-99`

Identical 5-line function. `@modularmind/ui` already exports `formatBytes` with equivalent logic.

**Recommendation**: Import `formatBytes` from `@modularmind/ui`.

---

## 3. Utility Duplications

### 3.1 formatTokenCount vs formatTokens (TS) (LOW)

**Files**:
- `apps/chat/src/components/InsightsPanel.tsx:36-41` — `formatTokenCount()`
- `packages/ui/src/lib/utils.ts` — `formatTokens()` (identical logic)

**Recommendation**: Import `formatTokens` from `@modularmind/ui`.

### 3.2 _truncate function duplication (Python) (LOW)

**Files**:
- `engine/server/src/graph_engine/callbacks.py:33-37`
- `engine/server/src/graph_engine/tool_loop.py:147-151`

Identical logic, only ellipsis representation differs (`"\u2026"` vs `"…"`).

**Recommendation**: Extract to `engine/server/src/infra/text_utils.py` and import in both files.

### 3.3 ContextMiniDonut duplication (TS) (LOW)

**Files**:
- `apps/chat/src/components/ChatInput.tsx:70-92`
- `platform/src/components/chat/ChatInput.tsx:70-92`

Character-for-character identical SVG component.

**Recommendation**: Move to `@modularmind/ui/components` as part of ChatInput consolidation (§1.1).

---

## 4. Inline Schemas in Router Files (Python)

23 Pydantic schemas remain defined directly in `engine/server/src/internal/` router files instead of `internal/schemas.py`:

| File | Schemas | Count |
|------|---------|-------|
| `internal/alerts.py` | ThresholdConfig, ThresholdUpdate, AlertHistoryResponse, ActiveAlertsResponse | 4 |
| `internal/monitoring.py` | GpuVramMonitoring, LlmPerformanceSnapshot, ModelEvent, LlmGpuMonitoring, AgentMetricsItem, ExecutionSummary, LiveExecutionsResponse | 7 |
| `internal/playground.py` | PlaygroundMessage, PlaygroundCompletionRequest, PlaygroundCompletionResponseBody | 3 |
| `internal/providers.py` | ProviderTestRequest, ProviderTestResponse, InternalPullRequest | 3 |
| `internal/settings.py` | SettingsResponse, SettingsUpdate | 2 |
| `internal/supervisor_layers.py` | LayerInfo, LayersResponse, LayerUpdateRequest, LayerUpdateResponse | 4 |
| `internal/logs.py` | LogEntry, LogsResponse | 2 (est.) |

**Note**: `internal/schemas.py` already exists with ~30 schemas from V3 migration, but these 23 were missed.

**Recommendation**: Move all 23 schemas to `internal/schemas.py` under clearly labeled sections.

---

## 5. Dead/Unused Code

### 5.1 AutoRetrainChecker — implemented but never called (LOW)

**File**: `engine/server/src/fine_tuning/auto_retrain.py` (161 lines)

Class is fully implemented but never imported or instantiated anywhere. Supporting DB schema exists (`auto_retrain_enabled`, `auto_retrain_threshold` columns), suggesting a partially built feature.

**Recommendation**: Remove the file. If/when auto-retrain is implemented, reconstruct from the DB schema and the git history.

---

## 6. Constants Scattered

### 6.1 Supervisor LLM constants not in infra/constants.py (LOW)

**File**: `engine/server/src/supervisor/service.py:29-34`

```python
ROUTING_TEMPERATURE = 0.1
TOOL_TEMPERATURE = 0.3
TOOL_LOOP_MAX_ITERATIONS = 10
EVENT_BUFFER_TTL_SECONDS = 300
MAX_TOOLS_IN_EVENT = 20
```

These are domain-specific constants used only in the supervisor module. Unlike `OUTPUT_TRUNCATION_LENGTH` (which is cross-module and lives in `infra/constants.py`), these are supervisor-scoped.

**Recommendation**: Keep in `supervisor/service.py` — they're module-scoped constants, not cross-cutting. No action needed.

**Updated status**: ⏳ Acceptable — module-scoped constants are fine where they are.

---

## Convention Compliance

| Check | Status |
|-------|--------|
| Hardcoded Tailwind colors | ✅ Zero violations |
| Silent catch blocks | ✅ All have logging/error handling |
| console.log debug leftovers | ✅ None found |
| `from shared.` imports | ✅ All use `from modularmind_shared.` |
| Missing "use client" directives | ✅ All hook-using UI components have it |
| `any` type usage | ✅ Only `db-utils.ts` with proper eslint-disable |
| Hardcoded magic numbers | ✅ All contextual or in named constants |
| Schemas in router files (non-internal) | ✅ All 16 non-internal routers clean |

---

## Priority Action Items

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| 🔴 HIGH | §1.1 — Consolidate ChatInput to `@modularmind/ui` | ~560 lines saved, single source of truth | Medium |
| 🟡 MEDIUM | §4 — Move 23 inline schemas to `internal/schemas.py` | Architectural consistency | Low |
| 🟡 MEDIUM | §2.1 — Import CatalogModel from api-client in ops | Type safety | Low |
| 🟢 LOW | §3.1 — Use `formatTokens` from ui lib | Remove redundant code | Trivial |
| 🟢 LOW | §2.2 — Use `formatBytes` from ui lib | Remove redundant code | Trivial |
| 🟢 LOW | §3.2 — Extract `_truncate` to shared utility | DRY | Trivial |
| 🟢 LOW | §5.1 — Remove `auto_retrain.py` | Remove dead code | Trivial |
| 🟢 LOW | §1.2 — Import shared helpers in InsightsPanel | Reduce duplication | Low |

---

## Cumulative Deferred Items (V1-V5)

| # | Item | Reason |
|---|------|--------|
| Engine types mirror (ui ↔ api-client) | Platform can't depend on api-client |
| Platform local types (Conversation, GraphNode/Edge, NodeType) | Architectural isolation |
| TokenUsage naming difference | camelCase (UI) vs snake_case (API) — intentional |
| User type reduction in auth store | Only stores needed fields |
| CollectionResponse admin vs rag | Different field sets, different contexts |
| Enums coupled to SQLAlchemy models | Low priority (V2) |
| pipeline/consumer.py stub | Feature implementation |
| Conversation compaction TODO | Feature implementation |
| Memory consolidation TODO | Feature implementation |
| `dict[str, Any]` in Python schemas | Genuinely dynamic fields |
| Large frontend components (McpServersTab, IntegrationsTab) | Well-structured, decompose when modified |
| useChatConfig load pattern | Different APIs, consolidation adds indirection |
| ChatMessages/useExecutionActivities re-exports | Thin wrappers for path consistency |
| Supervisor constants scoping | Module-scoped, not cross-cutting |

---

## Positive Observations

- ✅ Zero convention violations across all checks
- ✅ V4 ConsolidationLog issue properly resolved
- ✅ Zero hardcoded Tailwind colors
- ✅ Zero silent catch blocks
- ✅ Zero console.log debug leftovers
- ✅ All non-internal Python routers have schemas in dedicated files
- ✅ All 5 TypeScript packages type-check clean
- ✅ Clean, structured error handling throughout
- ✅ No security vulnerabilities detected
- ✅ No overengineering patterns — abstractions are proportional to usage
