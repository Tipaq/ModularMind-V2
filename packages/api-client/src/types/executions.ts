export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'awaiting_approval'
  | 'completed'
  | 'stopped'
  | 'failed';

export type ExecutionType = 'agent' | 'graph' | 'supervisor';

export interface ExecutionStep {
  id: string;
  run_id: string;
  step_number: number;
  node_id: string | null;
  node_type: string | null;
  node_name: string | null;
  parent_step_id: string | null;
  status: ExecutionStatus;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ExecutionRun {
  id: string;
  execution_type: ExecutionType;
  agent_id: string | null;
  graph_id: string | null;
  session_id: string | null;
  user_id: string;
  status: ExecutionStatus;
  config_version: number | null;
  config_hash: string | null;
  input_prompt: string;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  steps: ExecutionStep[];
  approval_node_id?: string | null;
  approval_timeout_at?: string | null;
}

export interface StartGraphExecutionRequest {
  graph_id: string;
  input_prompt: string;
  input_data?: Record<string, unknown>;
}

export interface ExecutionEvent {
  event:
    | 'step_started'
    | 'step_completed'
    | 'step_failed'
    | 'run_completed'
    | 'run_failed'
    | 'run_paused'
    | 'run_stopped'
    | 'streaming_chunk'
    | 'approval_required'
    | 'approval_granted'
    | 'approval_rejected'
    | 'approval_timeout';
  run_id: string;
  step_number?: number;
  node_id?: string | null;
  node_name?: string | null;
  output_data?: Record<string, unknown> | null;
  error_message?: string | null;
  reason?: string | null;
  current_node_id?: string | null;
  chunk?: string;
  duration_ms?: number | null;
  timestamp: string;
  timeout_at?: string;
  timeout_seconds?: number;
  approved_by?: string;
  rejected_by?: string;
  notes?: string;
  action?: string;
}

// ─── SSE Stream Events (discriminated union) ────────────────────────────────

export interface TokensStreamEvent {
  type: 'tokens';
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  model?: string;
}

export interface TraceStreamEvent {
  type: `trace:${string}`;
  event?: string;
  duration_ms?: number;
  // LLM
  model?: string;
  message_count?: number;
  prompt_preview?: string;
  response_preview?: string;
  tokens?: { total?: number; prompt?: number; completion?: number };
  // Tool
  tool_name?: string;
  server_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  input_preview?: string;
  output_preview?: string;
  // Retrieval
  status?: string;
  query?: string;
  num_results?: number;
  // Node
  node_name?: string;
  // Parallel / Loop
  branch_count?: number;
  mode?: string;
  total_items?: number;
  // Supervisor
  strategy?: string;
  agent_name?: string;
  is_ephemeral?: boolean;
  preview?: string;
  // Error
  error?: string;
  // Knowledge
  collections?: Array<{ collection_id: string; collection_name: string; chunk_count: number }>;
  chunks?: Array<{ chunk_id: string; content_preview: string; score: number }>;
}

export interface StepStreamEvent {
  type: 'step';
  event?: string;
  node_id?: string;
  node_name?: string;
  agent_name?: string;
  is_ephemeral?: boolean;
  output_data?: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration_ms?: number;
}

export interface CompleteStreamEvent {
  type: 'complete';
  output_data?: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration_ms?: number;
}

export interface ErrorStreamEvent {
  type: 'error';
  message?: string;
  error_message?: string;
}

export type ExecutionStreamEvent =
  | TokensStreamEvent
  | TraceStreamEvent
  | StepStreamEvent
  | CompleteStreamEvent
  | ErrorStreamEvent;
