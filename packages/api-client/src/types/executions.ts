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

export interface ExecutionStreamEvent {
  type: 'tokens' | 'trace' | 'step' | 'complete' | 'error';
  id?: string;
  data?: unknown;
}
