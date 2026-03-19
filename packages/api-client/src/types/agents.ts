import type { PaginatedResponse } from "./common";

// ─── Engine API types (match Python AgentSummary / AgentDetail) ──────────────

export interface Agent {
  id: string;
  name: string;
  description: string;
  model_id: string;
  version: number;
  memory_enabled: boolean;
  timeout_seconds: number;
  tool_categories: Record<string, boolean>;
}

export interface AgentDetail extends Agent {
  system_prompt: string;
  rag_enabled: boolean;
  rag_collection_ids: string[];
  rag_retrieval_count: number;
  rag_similarity_threshold: number;
  config_version: number | null;
  config_hash: string | null;
}

export type AgentListResponse = PaginatedResponse<Agent>;

// ─── Version History ─────────────────────────────────────────────────────────

export interface AgentVersionSummary {
  version: number;
  name: string;
  model_id: string | null;
  change_note: string | null;
  config_hash: string;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

// ─── Export / Import ─────────────────────────────────────────────────────────

export interface AgentExport {
  name: string;
  description: string | null;
  system_prompt: string;
  model_id: string;
}
