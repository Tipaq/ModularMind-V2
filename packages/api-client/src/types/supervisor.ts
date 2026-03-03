// ─── Enums ──────────────────────────────────────────────────────────────────

export type RoutingStrategy =
  | "DIRECT_RESPONSE"
  | "DELEGATE_AGENT"
  | "EXECUTE_GRAPH"
  | "CREATE_AGENT"
  | "MULTI_ACTION"
  | "TOOL_RESPONSE";

// ─── Models ─────────────────────────────────────────────────────────────────

export interface RoutingDecision {
  strategy: RoutingStrategy;
  agent_id?: string;
  graph_id?: string;
  reasoning: string;
  confidence: number;
  direct_response?: string;
  ephemeral_config?: Record<string, unknown>;
  sub_decisions?: RoutingDecision[];
}

export interface ParsedMessage {
  raw_content: string;
  clean_content: string;
  explicit_agent?: string;
  explicit_graph?: string;
  create_directive: boolean;
  create_instructions?: string;
}

export interface SubContext {
  agent_id: string;
  messages: Record<string, unknown>[];
  last_interaction: string;
  execution_count: number;
}

export interface SupervisorConfig {
  model_id: string;
  temperature: number;
  max_routing_tokens: number;
  session_affinity_threshold: number;
}
