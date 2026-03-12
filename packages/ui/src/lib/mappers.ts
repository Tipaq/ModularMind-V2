import type { KnowledgeCollection, KnowledgeChunk, KnowledgeData, ContextData } from "../types/chat";

/** Raw snake_case collection from API response. */
interface RawCollection {
  collection_id: string;
  collection_name: string;
  chunk_count: number;
}

/** Raw snake_case chunk from API response. */
interface RawChunk {
  chunk_id: string;
  document_id: string;
  collection_id: string;
  collection_name: string;
  document_filename?: string | null;
  content_preview: string;
  score: number;
  chunk_index: number;
}

/** Raw snake_case knowledge response from API. */
export interface RawKnowledgeData {
  collections?: RawCollection[];
  chunks?: RawChunk[];
  total_results?: number;
}

/** Map a single snake_case API collection to a camelCase KnowledgeCollection. */
function mapCollection(c: RawCollection): KnowledgeCollection {
  return {
    collectionId: c.collection_id,
    collectionName: c.collection_name,
    chunkCount: c.chunk_count,
  };
}

/** Map a single snake_case API chunk to a camelCase KnowledgeChunk. */
function mapChunk(ch: RawChunk): KnowledgeChunk {
  return {
    chunkId: ch.chunk_id,
    documentId: ch.document_id,
    collectionId: ch.collection_id,
    collectionName: ch.collection_name,
    documentFilename: ch.document_filename ?? null,
    contentPreview: ch.content_preview,
    score: ch.score,
    chunkIndex: ch.chunk_index,
  };
}

/** Map snake_case API knowledge response to camelCase UI types. */
export function mapKnowledgeData(raw: RawKnowledgeData): KnowledgeData {
  return {
    collections: (raw.collections || []).map(mapCollection),
    chunks: (raw.chunks || []).map(mapChunk),
    totalResults: raw.total_results || 0,
  };
}

// ─── Context Data Mapping ───────────────────────────────────────────────────

/** Raw snake_case context data from API/SSE (history + budget + user profile). */
export interface RawContextData {
  history?: {
    budget?: {
      included_count: number;
      total_chars: number;
      max_chars: number;
      budget_exceeded: boolean;
      context_window?: number;
      history_budget_pct?: number;
      history_budget_tokens?: number;
    };
    messages?: { role: string; content: string }[];
    summary?: string;
  };
  user_profile?: string | null;
  budget_overview?: {
    context_window: number;
    effective_context: number;
    max_pct: number;
    layers: {
      history: { pct: number; allocated: number; used: number };
      memory: { pct: number; allocated: number; used: number };
      rag: { pct: number; allocated: number; used: number };
      system?: { pct: number; allocated: number; used: number };
    };
  };
}

/** Map snake_case API context data to camelCase UI types. */
export function mapContextData(raw: RawContextData): ContextData {
  const h = raw.history;
  const bo = raw.budget_overview;
  return {
    history: h
      ? {
          budget: h.budget
            ? {
                includedCount: h.budget.included_count ?? 0,
                totalChars: h.budget.total_chars ?? 0,
                maxChars: h.budget.max_chars ?? 0,
                budgetExceeded: h.budget.budget_exceeded ?? false,
                contextWindow: h.budget.context_window,
                historyBudgetPct: h.budget.history_budget_pct,
                historyBudgetTokens: h.budget.history_budget_tokens,
              }
            : null,
          messages: h.messages || [],
          summary: h.summary || "",
        }
      : null,
    userProfile: raw.user_profile || null,
    budgetOverview: bo
      ? {
          contextWindow: bo.context_window,
          effectiveContext: bo.effective_context,
          maxPct: bo.max_pct,
          layers: {
            history: bo.layers.history,
            memory: bo.layers.memory,
            rag: bo.layers.rag,
            ...(bo.layers.system ? { system: bo.layers.system } : {}),
          },
        }
      : null,
  };
}

