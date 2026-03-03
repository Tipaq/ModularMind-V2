import type { PaginatedResponse } from "./common";

// ─── Enums ──────────────────────────────────────────────────────────────────

export type MemoryScope = "agent" | "user_profile" | "conversation" | "cross_conversation";
export type MemoryTier = "buffer" | "summary" | "vector" | "archive";
export type MemoryType = "episodic" | "semantic" | "procedural";
export type EdgeType = "entity_overlap" | "same_category" | "semantic_similarity" | "same_tag";

// ─── Entry ──────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  scope_id: string;
  tier: MemoryTier;
  memory_type: MemoryType;
  content: string;
  importance: number;
  access_count: number;
  last_accessed: string | null;
  expired_at: string | null;
  metadata: Record<string, unknown>;
  user_id: string | null;
  created_at: string;
}

export type MemoryListResponse = PaginatedResponse<MemoryEntry>;

// ─── Search ─────────────────────────────────────────────────────────────────

export interface MemorySearchRequest {
  query: string;
  scope: MemoryScope;
  scope_id: string;
  limit?: number;
  threshold?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface MemorySearchResponse {
  results: MemorySearchResult[];
  query_embedding_cached: boolean;
  warning: string | null;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export interface MemoryStatsResponse {
  total_entries: number;
  entries_by_tier: Record<string, number>;
  entries_by_type: Record<string, number>;
  oldest_entry: string | null;
  newest_entry: string | null;
}

export interface GlobalMemoryStatsResponse {
  total_entries: number;
  entries_by_type: Record<string, number>;
  entries_by_tier: Record<string, number>;
  entries_by_scope: Record<string, number>;
  avg_importance: number;
  total_accesses: number;
  last_consolidation: string | null;
  entries_decayed_last_cycle: number;
}

// ─── Consolidation ──────────────────────────────────────────────────────────

export interface ConsolidationLog {
  id: string;
  scope: string;
  scope_id: string;
  action: string;
  source_entry_ids: string[];
  result_entry_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

// ─── Graph ──────────────────────────────────────────────────────────────────

export interface MemoryGraphNode {
  id: string;
  content: string;
  memory_type: string;
  scope: string;
  scope_id: string;
  tier: string;
  importance: number;
  access_count: number;
  entities: string[];
  tags: string[];
  user_id: string | null;
  last_accessed: string | null;
  created_at: string;
}

export interface MemoryGraphEdge {
  source: string;
  target: string;
  edge_type: string;
  weight: number;
  shared_entities: string[];
}

export interface MemoryGraphData {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
}

// ─── Users ──────────────────────────────────────────────────────────────────

export interface MemoryUser {
  user_id: string;
  email: string | null;
  memory_count: number;
}
