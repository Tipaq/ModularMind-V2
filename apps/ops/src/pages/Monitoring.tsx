import { useEffect, useRef, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { PageHeader, Tabs, TabsList, TabsTrigger, TabsContent } from "@modularmind/ui";
import type { LlmGpuData, MonitoringData, PipelineData } from "@modularmind/api-client";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { OverviewTab } from "../components/monitoring/OverviewTab";
import { LlmGpuTab } from "../components/monitoring/LlmGpuTab";
import { InfraTab } from "../components/monitoring/InfraTab";

const POLL_INTERVAL_MS = 10_000;

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

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Track first successful load
  useEffect(() => {
    if (monitoring && !lastUpdated) setLastUpdated(new Date());
  }, [monitoring, lastUpdated]);

  // Auto-refresh every 10s
  const refetchMonitoringRef = useRef(refetchMonitoring);
  const refetchPipelineRef = useRef(refetchPipeline);
  const refetchLlmGpuRef = useRef(refetchLlmGpu);
  refetchMonitoringRef.current = refetchMonitoring;
  refetchPipelineRef.current = refetchPipeline;
  refetchLlmGpuRef.current = refetchLlmGpu;

  useEffect(() => {
    const id = setInterval(async () => {
      await Promise.all([
        refetchMonitoringRef.current(),
        refetchPipelineRef.current(),
        refetchLlmGpuRef.current(),
      ]);
      setLastUpdated(new Date());
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const handleManualRefresh = async () => {
    await Promise.all([refetchMonitoring(), refetchPipeline(), refetchLlmGpu()]);
    setLastUpdated(new Date());
  };

  const alertCount = monitoring?.alerts.active_count ?? 0;

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
          <TabsTrigger value="llm">LLM & GPU</TabsTrigger>
          <TabsTrigger value="infra">Infrastructure</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab monitoring={monitoring} pipeline={pipeline} />
        </TabsContent>

        <TabsContent value="llm" className="mt-6">
          <LlmGpuTab llmGpu={llmGpu} />
        </TabsContent>

        <TabsContent value="infra" className="mt-6">
          <InfraTab monitoring={monitoring} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
