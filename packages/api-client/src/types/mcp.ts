// ─── Enums ──────────────────────────────────────────────────────────────────

export type MCPTransport = "http" | "stdio";

// ─── Server Config ──────────────────────────────────────────────────────────

export interface MCPServerConfig {
  id: string;
  name: string;
  description: string | null;
  transport: MCPTransport;
  url: string | null;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  headers: Record<string, string>;
  secret_ref: string | null;
  enabled: boolean;
  timeout_seconds: number;
  project_id: string | null;
  managed: boolean;
  catalog_id: string | null;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string | null;
  input_schema: Record<string, unknown>;
}

export interface MCPToolCallRequest {
  server_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: Record<string, unknown>[];
  is_error: boolean;
}

// ─── Status ─────────────────────────────────────────────────────────────────

export interface MCPServerStatus {
  server_id: string;
  name: string;
  connected: boolean;
  tools_count: number;
  last_health_check: string | null;
  error: string | null;
}
