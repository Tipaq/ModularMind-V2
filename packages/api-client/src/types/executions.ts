export interface Execution {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  agent_id?: string;
  graph_id?: string;
  conversation_id: string;
  created_at: string;
  completed_at?: string;
  error?: string;
}

export interface ExecutionStreamEvent {
  type: "token" | "trace" | "step" | "tokens" | "complete" | "error";
  id?: string;
  data?: unknown;
}
