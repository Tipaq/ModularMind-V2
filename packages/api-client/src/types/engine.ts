/** Agent configuration as returned by the engine API. */
export interface EngineAgent {
  id: string;
  name: string;
  description?: string;
  model_id?: string;
  system_prompt?: string;
  version?: number;
  memory_enabled?: boolean;
  timeout_seconds?: number;
  rag_enabled?: boolean;
  rag_collection_ids?: string[];
  rag_retrieval_count?: number;
  rag_similarity_threshold?: number;
}

/** Graph configuration as returned by the engine API. */
export interface EngineGraph {
  id: string;
  name: string;
  description?: string;
  node_count?: number;
  edge_count?: number;
  version?: number;
}

/** Model info as returned by the engine API. */
export interface EngineModel {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  display_name: string | null;
  context_window?: number | null;
  is_active: boolean;
  is_available: boolean;
  is_embedding: boolean;
}

/** MCP server info as returned by the engine API. */
export interface McpServer {
  id: string;
  name: string;
  enabled: boolean;
  status?: string;
}

/** Supervisor layer info as returned by the engine API. */
export interface SupervisorLayer {
  key: string;
  label: string;
  description: string;
  content: string;
  filename: string;
}
