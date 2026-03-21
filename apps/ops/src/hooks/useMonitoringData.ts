import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentMetrics,
  LiveExecutionsData,
  LlmGpuData,
  MetricsHistory,
  MetricSeries,
  MonitoringData,
  PipelineData,
  PipelinesData,
} from "@modularmind/api-client";
import { AUTH_SESSION_EXPIRED_EVENT } from "@modularmind/api-client";
import type { TimeRange } from "../components/monitoring/MetricsChart";
import { useApi } from "./useApi";
import { api } from "../lib/api";

const POLL_INTERVAL_MS = 10_000;

export type SparklineData = Array<{ ts: number; value: number }>;

/** Extract a specific metric series into chart-ready data. */
export function extractSeries(
  history: MetricsHistory | null,
  metricName: string,
  valueKey: string = "v",
): SparklineData {
  if (!history) return [];
  const series = history.series.find((s: MetricSeries) => s.name === metricName);
  if (!series) return [];
  return series.points.map((p) => ({ ts: p.ts, value: p.value[valueKey] ?? 0 }));
}

export interface MonitoringDataResult {
  monitoring: MonitoringData | null;
  pipeline: PipelineData | null;
  llmGpu: LlmGpuData | null;
  liveExecutions: LiveExecutionsData | null;
  pipelinesDetail: PipelinesData | null;
  metricsHistory: MetricsHistory | null;
  agentMetrics: AgentMetrics[] | null;
  lastUpdated: Date | null;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  refetchAll: () => Promise<void>;
}

export function useMonitoringData(): MonitoringDataResult {
  const [timeRange, setTimeRange] = useState<TimeRange>("1h");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data: monitoring, refetch: refetchMonitoring } = useApi<MonitoringData>(
    () => api.get("/internal/monitoring"),
    [],
    { keepDataOnError: true },
  );
  const { data: pipeline, refetch: refetchPipeline } = useApi<PipelineData>(
    () => api.get("/report/pipeline"),
    [],
    { keepDataOnError: true },
  );
  const { data: llmGpu, refetch: refetchLlmGpu } = useApi<LlmGpuData>(
    () => api.get("/internal/llm-gpu"),
    [],
    { keepDataOnError: true },
  );
  const { data: liveExecutions, refetch: refetchLiveExecutions } = useApi<LiveExecutionsData>(
    () => api.get("/internal/executions/live"),
    [],
    { keepDataOnError: true },
  );
  const { data: pipelinesDetail, refetch: refetchPipelines } = useApi<PipelinesData>(
    () => api.get("/internal/pipelines"),
    [],
    { keepDataOnError: true },
  );
  const { data: metricsHistory, refetch: refetchMetricsHistory } = useApi<MetricsHistory>(
    () =>
      api.get(
        `/internal/metrics/history?range=${timeRange}&metrics=cpu,memory,disk,vram,queue,latency,llm_latency,llm_tps,llm_ttft`,
      ),
    [timeRange],
    { keepDataOnError: true },
  );
  const { data: agentMetrics, refetch: refetchAgentMetrics } = useApi<AgentMetrics[]>(
    () => api.get("/internal/metrics/agents"),
    [],
    { keepDataOnError: true },
  );

  // Stable ref-based refetchAll — avoids recreating the callback when
  // individual refetch functions change identity (which would restart polling).
  const refetchFnsRef = useRef({
    refetchMonitoring, refetchPipeline, refetchLlmGpu,
    refetchLiveExecutions, refetchPipelines, refetchMetricsHistory, refetchAgentMetrics,
  });
  useEffect(() => {
    refetchFnsRef.current = {
      refetchMonitoring, refetchPipeline, refetchLlmGpu,
      refetchLiveExecutions, refetchPipelines, refetchMetricsHistory, refetchAgentMetrics,
    };
  });

  const refetchAll = useCallback(async () => {
    const fns = refetchFnsRef.current;
    await Promise.all([
      fns.refetchMonitoring(), fns.refetchPipeline(), fns.refetchLlmGpu(),
      fns.refetchLiveExecutions(), fns.refetchPipelines(),
      fns.refetchMetricsHistory(), fns.refetchAgentMetrics(),
    ]);
    setLastUpdated(new Date());
  }, []);

  // Stop polling when session expires
  const sessionExpired = useRef(false);
  useEffect(() => {
    const handleExpired = () => { sessionExpired.current = true; };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!sessionExpired.current) refetchAll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetchAll]);

  return {
    monitoring,
    pipeline,
    llmGpu,
    liveExecutions,
    pipelinesDetail,
    metricsHistory,
    agentMetrics,
    lastUpdated,
    timeRange,
    setTimeRange,
    refetchAll,
  };
}
