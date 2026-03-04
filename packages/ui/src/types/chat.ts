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
