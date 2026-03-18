// ─── System ──────────────────────────────────────────────────────────────────

export interface GpuInfo {
  available: boolean;
  type: string;
  device_count: number;
  memory_gb: number;
}

export interface SystemMonitoring {
  cpu_percent: number;
  cpu_count: number;
  cpu_count_logical: number;
  memory_total_gb: number;
  memory_used_gb: number;
  memory_percent: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_percent: number;
  gpu: GpuInfo;
}

// ─── Worker / Streams ────────────────────────────────────────────────────────

export interface StreamInfo {
  length: number;
  consumers: number;
  lag: number;
}

export interface WorkerMonitoring {
  streams?: Record<string, StreamInfo>;
  status?: string;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export interface SchedulerMonitoring {
  global_current: number;
  global_max: number;
  active_slots: number;
  backpressure: boolean;
}

// ─── Infrastructure ───────────────────────────────────────────────────────────

export interface InfraMonitoring {
  db_pool_size: number;
  db_pool_max_overflow: number;
  redis_max_connections: number;
  redis_healthy: boolean;
  redis_latency_ms: number | null;
  ollama_status: string;
  ollama_models: string[];
  ollama_running_models: string[];
  qdrant_status: string;
  qdrant_latency_ms: number | null;
  qdrant_collections: number;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export interface AlertItem {
  id: string;
  metric: string;
  threshold: number;
  actual: number;
  message: string;
  severity: "critical" | "warning";
  triggered_at: string;
}

export interface AlertSummary {
  active_count: number;
  active_alerts: AlertItem[];
}

// ─── Main monitoring snapshot ─────────────────────────────────────────────────

export interface MonitoringData {
  timestamp: string;
  uptime_seconds: number;
  system: SystemMonitoring;
  worker: WorkerMonitoring;
  streaming: { active_streams: number };
  scheduler: SchedulerMonitoring;
  infrastructure: InfraMonitoring;
  alerts: AlertSummary;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

/** Keyed by stream name (e.g. "tasks:executions", "memory:raw", "dlq"). */
export type PipelineData = Record<string, StreamInfo>;

// ─── LLM / GPU ───────────────────────────────────────────────────────────────

export interface LoadedModel {
  name: string;
  size_vram_bytes: number;
  size_vram_gb: number;
  expires_at: string | null;
  context_length: number;
  parameter_size: string;
  quantization: string;
  family: string;
}

export interface GpuVramData {
  total_vram_gb: number;
  used_vram_gb: number;
  used_vram_percent: number;
  loaded_models: LoadedModel[];
  model_count: number;
}

export interface LlmPerformance {
  avg_latency_ms: number;
  avg_tokens_per_second: number;
  avg_ttft_ms: number;
  total_requests_last_hour: number;
}

export interface ModelEvent {
  type: "load" | "unload";
  model: string;
  ts: string;
}

export interface LlmGpuData {
  gpu_vram: GpuVramData;
  llm_performance: LlmPerformance;
  model_events: ModelEvent[];
}

// ─── Metrics history ─────────────────────────────────────────────────────────

export interface MetricPoint {
  ts: number;
  value: Record<string, number>;
}

export interface MetricSeries {
  name: string;
  points: MetricPoint[];
}

export interface MetricsHistory {
  series: MetricSeries[];
  range_seconds: number;
  interval_seconds: number;
}

// ─── Agent metrics ────────────────────────────────────────────────────────────

export interface AgentMetrics {
  agent_id: string;
  agent_name: string;
  total_executions: number;
  total_tokens: number;
  avg_duration_ms: number;
  error_count: number;
  error_rate: number;
}

// ─── Live executions (admin view, all users) ─────────────────────────────────

export interface ExecutionSummary {
  id: string;
  execution_type: "agent" | "graph" | "supervisor";
  status: "pending" | "running" | "paused" | "awaiting_approval" | "completed" | "failed" | "stopped";
  user_id: string;
  user_email: string;
  agent_id: string | null;
  graph_id: string | null;
  model: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  input_preview: string;
  started_at: string | null;
  created_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
}

export interface LiveExecutionsData {
  active: ExecutionSummary[];
  recent: ExecutionSummary[];
  total_active: number;
}

// ─── Pipelines ─────────────────────────────────────────────────────────────────

export interface StreamGroupInfo {
  name: string;
  pending: number;
  consumers: number;
}

export interface StreamDetail {
  length: number;
  groups: StreamGroupInfo[];
}

export interface DLQMessage {
  id: string;
  original_stream: string;
  original_id: string;
  error: string;
  data: string;
}

export interface DocumentStatusCounts {
  pending: number;
  processing: number;
  ready: number;
  failed: number;
  total: number;
}

export interface ActiveDocument {
  id: string;
  filename: string;
  collection_id: string;
  collection_name: string;
  status: string;
  error_message: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface KnowledgePipelineData {
  documents_stream: StreamDetail;
  dlq_stream?: StreamDetail;
  status_counts: DocumentStatusCounts;
  active_documents: ActiveDocument[];
}

export interface PipelineCounters {
  total_chunks: number;
  total_chunk_accesses: number;
}

export interface PipelinesData {
  knowledge: KnowledgePipelineData;
  dlq_messages: DLQMessage[];
  counters: PipelineCounters;
}

// ─── Alert management ────────────────────────────────────────────────────────

export interface ThresholdConfig {
  cpu_percent: number;
  memory_percent: number;
  workers_min: number;
  dlq_max: number;
  queue_depth_max: number;
  enabled: boolean;
}

export interface ThresholdUpdate {
  cpu_percent?: number;
  memory_percent?: number;
  workers_min?: number;
  dlq_max?: number;
  queue_depth_max?: number;
  enabled?: boolean;
}

export interface AlertHistoryResponse {
  items: AlertItem[];
  total: number;
}
