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

// ─── Shared camelCase types for Token Usage / Execution Output / Context ─────
// These mirror the snake_case API response but use camelCase for the UI layer.

/** Token usage for a single LLM call (camelCase UI layer). */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/** Parsed execution output from SSE stream. */
export interface ExecutionOutputData {
  response?: string;
  messages?: Array<{ type: string; content?: string }>;
  node_outputs?: Record<string, { response?: string }>;
}

/** Context history message in budget tracking. */
export interface ContextHistoryMessage {
  role: string;
  content: string;
}

/** Context history budget limits. */
export interface ContextHistoryBudget {
  includedCount: number;
  totalChars: number;
  maxChars: number;
  budgetExceeded: boolean;
  contextWindow?: number;
  historyBudgetPct?: number;
  historyBudgetTokens?: number;
}

/** Context history with messages and budget. */
export interface ContextHistory {
  budget: ContextHistoryBudget | null;
  messages: ContextHistoryMessage[];
  summary: string;
}

/** Budget allocation for a single context layer. */
export interface BudgetLayerInfo {
  pct: number;
  allocated: number;
  used: number;
}

/** Overview of context budget allocation across layers. */
export interface BudgetOverview {
  contextWindow: number;
  effectiveContext: number;
  maxPct: number;
  layers: {
    history: BudgetLayerInfo;
    memory: BudgetLayerInfo;
    rag: BudgetLayerInfo;
    system?: BudgetLayerInfo;
  };
}

/** Full context data for a message execution. */
export interface ContextData {
  history: ContextHistory | null;
  memoryEntries: InsightsMemoryEntry[];
  budgetOverview: BudgetOverview | null;
}

/** File attached to a chat message (before upload). */
export interface AttachedFile {
  file: File;
  id: string;
}

/** Execution data associated with a specific message. */
export interface MessageExecutionData {
  activities: ExecutionActivity[];
  memoryEntries: InsightsMemoryEntry[];
  knowledgeData: KnowledgeData | null;
  tokenUsage: TokenUsage | null;
  contextData: ContextData | null;
}
