export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  uptime_seconds: number;
}

export interface WorkerStatus {
  running: boolean;
  streams: string[];
  scheduler_jobs: number;
  uptime_seconds: number;
}

export interface PipelineHealth {
  streams: Record<string, { length: number; consumers: number; lag: number }>;
  dlq_size: number;
}
