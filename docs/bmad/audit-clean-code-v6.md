# BMAD Audit V6 — Clean Code, Duplications & Dead Code

**Date**: 2026-03-05
**Scope**: Full codebase (apps/, packages/, engine/, shared/, platform/)
**Status**: OPEN

---

## Executive Summary

| Category | Issues | Actionable | Deferred |
|----------|--------|------------|----------|
| 1. Component Duplications (TS) | 4 | 4 | 0 |
| 2. Re-export Shims (TS) | 2 | 2 | 0 |
| 3. Utility Wrapper Indirection (Python) | 2 | 2 | 0 |
| 4. Duplicate Service Methods (Python) | 1 | 1 | 0 |
| 5. Dead / Placeholder Code (Python) | 1 | 1 | 0 |
| **Total** | **10** | **10** | **0** |

**Overall grade: A-** — No convention violations. 4 duplicate shared components are the main concern.

---

## Findings

### §1. Component Duplications (TypeScript) — HIGH

Four shared UI components are duplicated between `apps/ops` and `platform`:

| # | Component | Ops | Platform | Diff |
|---|-----------|-----|----------|------|
| 1.1 | ResourceFilters | `apps/ops/src/components/shared/ResourceFilters.tsx` (81 lines) | `platform/src/components/studio/shared/ResourceFilters.tsx` (83 lines) | Identical (only "use client" differs) |
| 1.2 | EmptyState | `apps/ops/src/components/shared/EmptyState.tsx` (23 lines) | `platform/src/components/studio/shared/EmptyState.tsx` (25 lines) | Identical (only "use client" differs) |
| 1.3 | ResourceTable | `apps/ops/src/components/shared/ResourceTable.tsx` (179 lines) | `platform/src/components/studio/shared/ResourceTable.tsx` (181 lines) | Near-identical: ops uses `cn()`, platform uses template literals for class composition |
| 1.4 | DetailHeader | `apps/ops/src/components/shared/DetailHeader.tsx` (54 lines) | `platform/src/components/studio/shared/DetailHeader.tsx` (56 lines) | Different Link component: React Router (`to=`) vs Next.js (`href=`) |

**Fix**: Move to `packages/ui`. For DetailHeader, accept Link as a render prop or use a generic `<a>` wrapper with `href`.

---

### §2. Re-export Shims (TypeScript) — LOW

Two files created during V5 ChatInput consolidation are pure re-exports (3 lines each):

| # | File | Content |
|---|------|---------|
| 2.1 | `apps/chat/src/components/ChatInput.tsx` | `export { ChatInput } from "@modularmind/ui"` |
| 2.2 | `platform/src/components/chat/ChatInput.tsx` | `export { ChatInput } from "@modularmind/ui"` |

**Fix**: Delete shims; update imports in `Chat.tsx` and `page.tsx` to import directly from `@modularmind/ui`.

---

### §3. Utility Wrapper Indirection (Python) — LOW

Two `_truncate()` wrappers are pure one-line delegates to `infra.text_utils.truncate`:

| # | File | Lines |
|---|------|-------|
| 3.1 | `engine/server/src/graph_engine/tool_loop.py` | 147-150 |
| 3.2 | `engine/server/src/graph_engine/callbacks.py` | 33-36 |

**Fix**: Replace calls to `_truncate(text, n)` with direct `from src.infra.text_utils import truncate` and `truncate(text, n)`.

---

### §4. Duplicate Service Methods (Python) — LOW

`engine/server/src/conversations/service.py` has two near-identical methods:

| Method | Line | Loads Messages | Callers |
|--------|------|---------------|---------|
| `get_conversation()` | 148 | Yes (selectinload) | 2 (router detail + supervisor) |
| `get_conversation_by_id()` | 157 | No | 5 (CRUD + message send) |

**Fix**: Consolidate into one method with `include_messages: bool = False` parameter.

---

### §5. Dead / Placeholder Code (Python) — LOW

| # | File | Issue |
|---|------|-------|
| 5.1 | `engine/server/src/pipeline/consumer.py` | Empty file — only docstring + TODO comments, never imported anywhere |

**Fix**: Delete file. Re-create when implementing the memory pipeline consumer.

---

## Convention Compliance

| Check | Status |
|-------|--------|
| Hardcoded Tailwind colors | ✅ Zero violations |
| Raw Radix primitives usage | ✅ Zero violations (all through @modularmind/ui wrappers) |
| Missing "use client" in packages/ui | ✅ All hook-using components have it |
| `from shared.` imports | ✅ All use `from modularmind_shared.` |
| Schemas in router files | ✅ All in dedicated schema modules |
| Backward-compat patterns | ✅ None remaining (validation_alias, _unused vars, // removed comments) |
| Silent catch blocks | ✅ All have logging/error handling |
| console.log debug leftovers | ✅ None found |

---

## Previously Deferred Items Status (V1-V5)

| Item | Status | Notes |
|------|--------|-------|
| Engine types mirror (ui ↔ api-client) | Remains deferred | Architectural constraint — platform can't depend on api-client |
| Platform local types (SendMessageResponse, etc.) | Remains deferred | Intentional isolation — different nullability semantics |
| TokenUsage naming (camelCase vs snake_case) | Remains deferred | Intentional UI normalization |
| InsightsPanel parallel implementations | Remains deferred | Different data structures and hooks between apps/chat and platform |
| useChat parallel implementations | Remains deferred | Different lifecycles, partial sharing via extractResponse |
| Memory consolidation TODO (scheduler.py) | Remains deferred | Feature stub, not dead code |
| Large components (McpServersTab 864L, IntegrationsTab 651L) | Remains deferred | Well-structured, decompose when modified |
| `dict[str, Any]` in Python schemas | Remains deferred | Genuinely dynamic fields |

---

## Positive Observations

- ✅ Zero convention violations across all checks
- ✅ All 5 TypeScript packages type-check clean
- ✅ No backward-compatibility patterns remaining
- ✅ No hardcoded Tailwind colors
- ✅ No overengineering patterns
- ✅ No security vulnerabilities detected
- ✅ All Python schemas in dedicated files
- ✅ All prior V5 actionable items fully resolved
