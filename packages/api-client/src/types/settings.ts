// ─── Runtime Settings ────────────────────────────────────────────────────────

export interface LocalSettings {
  llm_api_keys: Record<string, string>;
  default_model: string | null;
  telemetry_enabled: boolean;
  auto_sync: boolean;
  sync_interval_minutes: number;
  ollama_keep_alive: string;
  max_execution_timeout: number;
  knowledge_embedding_provider: string;
  knowledge_embedding_model: string;
}

// ─── MCP Servers ─────────────────────────────────────────────────────────────

export interface MCPServer {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  enabled: boolean;
  connected: boolean;
  tools_count: number;
  timeout_seconds: number;
  project_id: string | null;
  managed: boolean;
  catalog_id: string | null;
  transport: 'http' | 'stdio';
  access_tier: string | null;
}

export interface MCPCatalogSecret {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  is_secret: boolean;
}

export interface MCPCatalogEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  required_secrets: MCPCatalogSecret[];
  documentation_url: string | null;
  npm_package: string | null;
  docker_image: string | null;
  setup_flow: string | null;
}

export interface MCPSidecarStatus {
  docker_available: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPTestResult {
  connected: boolean;
  tools_count: number;
  error: string | null;
}

// ─── Connectors ──────────────────────────────────────────────────────────────

export type ConnectorScope = 'user' | 'project' | 'global';

export interface ConnectorData {
  id: string;
  name: string;
  connector_type: string;
  agent_id: string | null;
  graph_id: string | null;
  supervisor_mode: boolean;
  webhook_url: string;
  is_enabled: boolean;
  config: Record<string, string>;
  scope: ConnectorScope;
  user_id: string | null;
  project_id: string | null;
  has_spec: boolean;
  credential_count: number;
  has_user_credential: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectorCredentialData {
  id: string;
  connector_id: string;
  user_id: string | null;
  credential_type: string;
  label: string;
  provider: string | null;
  scopes: string[] | null;
  is_valid: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectorCredentialCreate {
  credential_type: string;
  label: string;
  value: string;
  refresh_token?: string;
  provider?: string;
  scopes?: string[];
}

// ─── Connector Types (dynamic from backend) ─────────────────────────────────

export interface ConnectorFieldDef {
  key: string;
  label: string;
  placeholder: string;
  is_secret: boolean;
  is_required: boolean;
}

export interface ConnectorTypeDef {
  type_id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  doc_url: string;
  setup_steps: string[];
  fields: ConnectorFieldDef[];
}

// ─── Provider Testing ────────────────────────────────────────────────────────

export interface ProviderTestResponse {
  provider: string;
  available: boolean;
  error: string | null;
}
