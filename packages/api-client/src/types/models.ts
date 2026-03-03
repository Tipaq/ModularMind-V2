export type ModelProvider = 'ollama' | 'openai' | 'anthropic' | 'google' | 'mistral' | 'cohere' | 'groq';

export type ModelType = 'remote' | 'local';

export type ModelStatus = 'available' | 'unavailable';

export type PullStatus = 'pending' | 'downloading' | 'ready' | 'error' | null;

export interface CatalogModel {
  id: string;
  provider: ModelProvider;
  model_name: string;
  display_name: string;
  model_type: ModelType;
  context_window: number | null;
  max_output_tokens: number | null;
  family: string | null;
  size: string | null;
  disk_size: string | null;
  quantization: string | null;
  capabilities: Record<string, boolean>;
  is_required: boolean;
  is_enabled: boolean;
  is_global: boolean;
  pull_status: PullStatus;
  pull_progress: number | null;
  pull_error: string | null;
  model_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BrowsableModel {
  provider: ModelProvider;
  model_name: string;
  display_name: string;
  context_window: number | null;
  max_output_tokens?: number | null;
  size: string | null;
  disk_size: string | null;
  family: string | null;
  capabilities: Record<string, boolean>;
  model_type: ModelType;
  source: 'curated' | 'dynamic';
}

export interface PaginatedCatalog {
  models: CatalogModel[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
// Note: PaginatedCatalog uses `models` key instead of `items`, so it cannot
// extend the generic PaginatedResponse<T>. This is intentional.

export interface ProviderConfig {
  provider: ModelProvider;
  name: string;
  api_key?: string;
  base_url?: string;
  is_configured: boolean;
  is_connected: boolean;
  last_tested_at?: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export const PROVIDER_INFO: Record<ModelProvider, { name: string; color: string }> = {
  ollama: { name: 'Ollama', color: 'bg-muted' },
  openai: { name: 'OpenAI', color: 'bg-success' },
  anthropic: { name: 'Anthropic', color: 'bg-warning' },
  google: { name: 'Google', color: 'bg-info' },
  mistral: { name: 'Mistral', color: 'bg-accent' },
  cohere: { name: 'Cohere', color: 'bg-secondary' },
  groq: { name: 'Groq', color: 'bg-primary' },
};

const DEFAULT_PROVIDER = { name: 'Unknown', color: 'bg-muted' };
export function getProviderInfo(provider: string): { name: string; color: string } {
  return PROVIDER_INFO[provider as ModelProvider] ?? DEFAULT_PROVIDER;
}

export type UnifiedStatus = 'ready' | 'downloading' | 'not_pulled' | 'no_credentials' | 'error';

interface UnifiedModelBase {
  id: string;
  provider: ModelProvider;
  model_name: string;
  name: string;
  size: string | null;
  disk_size: string | null;
  context_window: number | null;
  model_type: ModelType;
  unifiedStatus: UnifiedStatus;
}

export interface CatalogEntry extends UnifiedModelBase {
  source: 'catalog';
  data: CatalogModel;
}

export interface BrowsableEntry extends UnifiedModelBase {
  source: 'browsable';
  data: BrowsableModel;
}

export type UnifiedCatalogModel = CatalogEntry | BrowsableEntry;
