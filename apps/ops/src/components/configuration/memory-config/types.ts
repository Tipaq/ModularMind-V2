export interface MemoryConfig {
  decay_episodic_half_life: number;
  decay_semantic_half_life: number;
  decay_procedural_half_life: number;
  decay_prune_threshold: number;
  score_weight_recency: number;
  score_weight_importance: number;
  score_weight_relevance: number;
  score_weight_frequency: number;
  min_relevance_gate: number;
  extraction_batch_size: number;
  extraction_idle_seconds: number;
  extraction_scan_interval: number;
  buffer_token_threshold: number;
  max_entries: number;
  fact_extraction_enabled: boolean;
  fact_extraction_min_messages: number;
  scorer_enabled: boolean;
  scorer_min_importance: number;
  context_budget_history_pct: number;
  context_budget_memory_pct: number;
  context_budget_rag_pct: number;
  context_budget_default_context_window: number;
  context_budget_max_pct: number;
}

export interface CatalogModel {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
  model_type?: string;
  is_embedding?: boolean;
  capabilities?: Record<string, boolean>;
  pull_status?: string | null;
  context_window?: number | null;
}

/** Getter for a config value (returns draft value if present, else config value) */
export type ConfigGetter = <K extends keyof MemoryConfig>(key: K) => MemoryConfig[K];

/** Setter for a config value */
export type ConfigSetter = <K extends keyof MemoryConfig>(key: K, value: MemoryConfig[K]) => void;
