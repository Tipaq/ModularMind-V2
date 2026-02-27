export interface Agent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  project_id: string | null;
  is_template: boolean;
  template_id: string | null;
  llm_config: Record<string, unknown>;
  config_overrides: Record<string, unknown>;
}

export interface AgentCreate {
  name: string;
  description?: string | null;
  system_prompt: string;
  model_id: string;
  project_id?: string | null;
  template_id?: string | null;
  is_template?: boolean;
  llm_config?: Record<string, unknown>;
  config_overrides?: Record<string, unknown>;
  change_note?: string;
}

export interface AgentUpdate {
  name?: string | null;
  description?: string | null;
  system_prompt?: string | null;
  model_id?: string | null;
  version: number;
  llm_config?: Record<string, unknown> | null;
  config_overrides?: Record<string, unknown> | null;
  change_note?: string;
}

export interface AgentListResponse {
  items: Agent[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AgentExport {
  name: string;
  description: string | null;
  system_prompt: string;
  model_id: string;
  llm_config: Record<string, unknown>;
  is_template: boolean;
}

export interface RuntimeAgent {
  id: string;
  name: string;
  description: string | null;
  model_id: string;
  version: number;
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

export interface RuntimeAgentDetail extends RuntimeAgent {
  system_prompt: string;
  memory_enabled: boolean;
  timeout_seconds: number;
  rag_enabled: boolean;
  rag_collection_ids: string[];
  rag_retrieval_count: number;
  rag_similarity_threshold: number;
  config_version: number | null;
  config_hash: string | null;
}

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
