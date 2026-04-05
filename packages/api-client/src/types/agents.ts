import type { PaginatedResponse } from "./common";

export type ToolCategories = Record<string, boolean | Record<string, boolean>>;

// ─── Engine API types (match Python AgentSummary / AgentDetail) ──────────────

export interface Agent {
  id: string;
  name: string;
  description: string;
  model_id: string;
  version: number;
  memory_enabled: boolean;
  timeout_seconds: number;
  system_prompt: string;
  rag_enabled: boolean;
  rag_collection_ids: string[];
  rag_retrieval_count: number;
  rag_similarity_threshold: number;
  tool_categories: ToolCategories;
  tool_mode: "direct" | "auto";
}

export interface AgentDetail extends Agent {
  capabilities: string[];
  gateway_permissions: Record<string, unknown> | null;
  routing_metadata: Record<string, unknown>;
  config_version: number | null;
  config_hash: string | null;
}

export type AgentListResponse = PaginatedResponse<Agent>;

// ─── Create / Update ────────────────────────────────────────────────────────

export interface RAGConfigInput {
  enabled: boolean;
  collection_ids: string[];
  retrieval_count?: number;
  similarity_threshold?: number;
}

export interface AgentCreateInput {
  name: string;
  description?: string;
  model_id: string;
  system_prompt?: string;
  memory_enabled?: boolean;
  timeout_seconds?: number;
  rag_config?: RAGConfigInput;
  tool_categories?: ToolCategories;
  gateway_permissions?: Record<string, unknown> | null;
  capabilities?: string[];
  routing_metadata?: Record<string, unknown>;
}

export interface AgentUpdateInput {
  name?: string;
  description?: string;
  model_id?: string;
  system_prompt?: string;
  memory_enabled?: boolean;
  timeout_seconds?: number;
  rag_config?: RAGConfigInput;
  tool_categories?: ToolCategories;
  tool_mode?: "direct" | "auto";
  gateway_permissions?: Record<string, unknown> | null;
  capabilities?: string[];
  routing_metadata?: Record<string, unknown>;
  change_note?: string;
}

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
