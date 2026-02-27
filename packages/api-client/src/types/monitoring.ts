export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  uptime_seconds: number;
}

export interface CeleryStatus {
  workers: number;
  active_tasks: number;
  queued_tasks: number;
  queues: Record<string, number>;
}

export interface PipelineHealth {
  streams: Record<string, { length: number; consumers: number; lag: number }>;
  dlq_size: number;
}
