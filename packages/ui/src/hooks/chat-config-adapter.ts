import type { EngineAgent, EngineGraph, EngineModel, McpServer, SupervisorLayer } from "../types/engine";

// ─── ChatConfigAdapter ─────────────────────────────────────────────────────
// Abstracts config fetching so useChatConfig works identically in:
//   - apps/chat  (direct Engine API via @modularmind/api-client)
//   - platform   (Next.js proxy routes via fetch)

export interface ChatConfigData {
  agents: EngineAgent[];
  graphs: EngineGraph[];
  models: EngineModel[];
  mcpServers?: McpServer[];
  supervisorLayers?: SupervisorLayer[];
  userPreferences?: string | null;
}

export interface ChatConfigAdapter {
  /** Fetch all chat config data (agents, graphs, models, etc.). */
  fetchConfig(): Promise<ChatConfigData>;

  /** Update a supervisor layer's content. Only available in platform. */
  updateSupervisorLayer?(key: string, content: string): Promise<boolean>;

  /** Save user preferences. Only available in apps/chat. */
  savePreferences?(prefs: string): Promise<void>;
}
