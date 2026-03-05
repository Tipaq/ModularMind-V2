export type ActivityType =
  | "step"
  | "llm"
  | "tool"
  | "retrieval"
  | "parallel"
  | "loop"
  | "error"
  | "routing"
  | "delegation"
  | "direct_response"
  | "agent_created";

export type ActivityStatus = "running" | "completed" | "failed";

export interface ToolCallData {
  toolName: string;
  serverName?: string;
  args?: string;
  result?: string;
}

export interface ExecutionActivity {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  label: string;
  detail?: string;
  preview?: string;
  startedAt: number;
  durationMs?: number;
  toolData?: ToolCallData;
  agentName?: string;
  isEphemeral?: boolean;
  model?: string;
  tools?: string[];
}

// ─── Shared camelCase types for Insights / Knowledge / Memory panels ─────────
// These are the UI-facing versions of the snake_case API response types.
// Both chat app and platform import from here to avoid duplication.

export interface KnowledgeCollection {
  collectionId: string;
  collectionName: string;
  chunkCount: number;
}

export interface KnowledgeChunk {
  chunkId: string;
  documentId: string;
  collectionId: string;
  collectionName: string;
  documentFilename: string | null;
  contentPreview: string;
  score: number;
  chunkIndex: number;
}

export interface KnowledgeData {
  collections: KnowledgeCollection[];
  chunks: KnowledgeChunk[];
  totalResults: number;
}

export interface InsightsMemoryEntry {
  id: string;
  content: string;
  scope: string;
  tier: string;
  importance: number;
  memoryType: string;
  category: string;
}

export interface SupervisorData {
  routingStrategy: string | null;
  delegatedTo: string | null;
  isEphemeral: boolean;
  ephemeralAgent: { id: string; name: string } | null;
}
