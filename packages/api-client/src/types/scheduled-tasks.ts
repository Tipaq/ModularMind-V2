export interface ScheduledTaskTriggerConfig {
  type: "cron" | "manual";
  interval_seconds: number;
  source: string;
  github_token_ref: string;
  repos: string[];
}

export interface ScheduledTaskTriageConfig {
  enabled: boolean;
  simple_threshold: {
    max_files: number;
    max_lines: number;
  };
}

export interface ScheduledTaskExecutionConfig {
  agent_id: string | null;
  graph_id: string | null;
  model_override: string | null;
  timeout_seconds: number;
}

export interface ScheduledTaskPostAction {
  type: string;
  on: "always" | "success" | "failure";
  method?: string;
  url?: string;
}

export interface ScheduledTaskSettings {
  dry_run: boolean;
  max_per_cycle: number;
  skip_labels: string[];
  require_labels: string[];
  branches: string[];
}

export interface ScheduledTaskConfig {
  trigger: Partial<ScheduledTaskTriggerConfig>;
  triage: Partial<ScheduledTaskTriageConfig>;
  execution: Partial<ScheduledTaskExecutionConfig>;
  post_actions: ScheduledTaskPostAction[];
  settings: Partial<ScheduledTaskSettings>;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
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
