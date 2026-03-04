import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { PageHeader, Tabs, TabsList, TabsTrigger, TabsContent } from "@modularmind/ui";
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
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { OverviewTab } from "../components/monitoring/OverviewTab";
import { LlmGpuTab } from "../components/monitoring/LlmGpuTab";
import { InfraTab } from "../components/monitoring/InfraTab";
import { ActiveInstancesTab } from "../components/monitoring/ActiveInstancesTab";
import { PipelinesTab } from "../components/monitoring/PipelinesTab";

const POLL_INTERVAL_MS = 10_000;

/** Extract a specific metric series into sparkline-ready data. */
function extractSeries(
  history: MetricsHistory | null,
  metricName: string,
  valueKey: string = "v",
): Array<{ ts: number; value: number }> {
  if (!history) return [];
  const series = history.series.find((s: MetricSeries) => s.name === metricName);
  if (!series) return [];
  return series.points.map((p) => ({ ts: p.ts, value: p.value[valueKey] ?? 0 }));
}

export default function Monitoring() {
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
    () => api.get("/internal/metrics/history?range=1h&metrics=cpu,memory,queue,latency,llm_latency,llm_tps,llm_ttft"),
    [],
    { keepDataOnError: true },
  );
  const { data: agentMetrics, refetch: refetchAgentMetrics } = useApi<AgentMetrics[]>(
    () => api.get("/internal/metrics/agents"),
    [],
    { keepDataOnError: true },
  );

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Auto-refresh every 10s — refetch functions are stable (useCallback in useApi)
  useEffect(() => {
    const id = setInterval(async () => {
      await Promise.all([
        refetchMonitoring(),
        refetchPipeline(),
        refetchLlmGpu(),
        refetchLiveExecutions(),
        refetchPipelines(),
        refetchMetricsHistory(),
        refetchAgentMetrics(),
      ]);
      setLastUpdated(new Date());
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetchMonitoring, refetchPipeline, refetchLlmGpu, refetchLiveExecutions, refetchPipelines, refetchMetricsHistory, refetchAgentMetrics]);

  const handleManualRefresh = async () => {
    await Promise.all([
      refetchMonitoring(),
      refetchPipeline(),
      refetchLlmGpu(),
      refetchLiveExecutions(),
      refetchPipelines(),
      refetchMetricsHistory(),
      refetchAgentMetrics(),
    ]);
    setLastUpdated(new Date());
  };

  const alertCount = monitoring?.alerts.active_count ?? 0;
  const activeCount = liveExecutions?.total_active ?? 0;
  const failedDocs = pipelinesDetail?.knowledge.status_counts.failed ?? 0;

  // Pre-extract sparkline series for child tabs
  const sparklines = {
    cpu: extractSeries(metricsHistory, "cpu"),
    memory: extractSeries(metricsHistory, "memory"),
    queue: extractSeries(metricsHistory, "queue", "total"),
    latency: extractSeries(metricsHistory, "latency"),
    llm_latency: extractSeries(metricsHistory, "llm_latency"),
    llm_tps: extractSeries(metricsHistory, "llm_tps"),
    llm_ttft: extractSeries(metricsHistory, "llm_ttft"),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        gradient="from-success to-success/70"
        title="Monitoring"
        description="System health, resources, and live activity"
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            {alertCount > 0 && (
              <span className="rounded-md bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive">
                ⚠ {alertCount} alert{alertCount > 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={handleManualRefresh}
              className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/80 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="instances" className="flex items-center gap-1.5">
            Instances
            {activeCount > 0 && (
              <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-xs font-medium text-success leading-none">
                {activeCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="llm">LLM & GPU</TabsTrigger>
          <TabsTrigger value="infra">Infrastructure</TabsTrigger>
          <TabsTrigger value="pipelines" className="flex items-center gap-1.5">
            Pipelines
            {failedDocs > 0 && (
              <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-xs font-medium text-destructive leading-none">
                {failedDocs}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab monitoring={monitoring} pipeline={pipeline} sparklines={sparklines} />
        </TabsContent>

        <TabsContent value="instances" className="mt-6">
          <ActiveInstancesTab liveExecutions={liveExecutions} agentMetrics={agentMetrics ?? null} />
        </TabsContent>

        <TabsContent value="llm" className="mt-6">
          <LlmGpuTab llmGpu={llmGpu} sparklines={sparklines} />
        </TabsContent>

        <TabsContent value="infra" className="mt-6">
          <InfraTab monitoring={monitoring} sparklines={sparklines} />
        </TabsContent>

        <TabsContent value="pipelines" className="mt-6">
          <PipelinesTab pipelines={pipelinesDetail} onRefresh={handleManualRefresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
