// ─── Runtime Settings ────────────────────────────────────────────────────────

export interface LocalSettings {
  llm_api_keys: Record<string, string>;
  default_model: string | null;
  telemetry_enabled: boolean;
  auto_sync: boolean;
  sync_interval_minutes: number;
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
}

export interface MCPCatalogEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  image: string;
  env_keys: string[];
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

export interface ConnectorData {
  id: string;
  name: string;
  connector_type: string;
  agent_id: string;
  webhook_url: string;
  is_enabled: boolean;
  config: Record<string, string>;
  created_at: string;
  updated_at: string;
}

// ─── Provider Testing ────────────────────────────────────────────────────────

export interface ProviderTestResponse {
  provider: string;
  available: boolean;
  error: string | null;
}
