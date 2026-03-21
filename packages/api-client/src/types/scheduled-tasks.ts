export type ScheduleType = "interval" | "one_shot" | "manual";
export type IntervalUnit = "minutes" | "hours" | "days";
export type TargetType = "agent" | "graph";

export interface ScheduledTaskConfig {
  trigger?: Record<string, unknown>;
  triage?: Record<string, unknown>;
  post_actions?: Array<{ type: string; on: string; method?: string; url?: string }>;
  settings?: Record<string, unknown>;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule_type: ScheduleType;
  interval_value: number | null;
  interval_unit: IntervalUnit | null;
  scheduled_at: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  target_type: TargetType;
  target_id: string | null;
  input_text: string;
  config: Partial<ScheduledTaskConfig>;
  version: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type ScheduledTaskRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface ScheduledTaskRun {
  id: string;
  scheduled_task_id: string | null;
  status: ScheduledTaskRunStatus;
  source_type: string;
  source_ref: string;
  execution_id: string | null;
  result_summary: string;
  error_message: string;
  duration_seconds: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface ScheduledTaskListResponse {
  items: ScheduledTask[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
