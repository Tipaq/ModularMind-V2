"use client";

import { useMemo } from "react";
import type { MonitoringDataResult } from "../../../hooks/useMonitoringData";
import { extractSeries } from "../../../hooks/useMonitoringData";
import { KpiStrip } from "../KpiStrip";
import { AlertsSection } from "../AlertsSection";
import { MetricsChart } from "../MetricsChart";
import { ServicesPanel } from "../ServicesPanel";
import { AgentPerformanceTable } from "../AgentPerformanceTable";

interface OverviewTabProps {
  data: MonitoringDataResult;
}

export function OverviewTab({ data }: OverviewTabProps) {
  const { monitoring, llmGpu, agentMetrics, liveExecutions, metricsHistory, timeRange, setTimeRange } = data;

  const systemSeries = useMemo(() => [
    { name: "CPU", data: extractSeries(metricsHistory, "cpu"), color: "hsl(var(--info))" },
    { name: "RAM", data: extractSeries(metricsHistory, "memory"), color: "hsl(var(--primary))" },
    { name: "GPU VRAM", data: extractSeries(metricsHistory, "vram"), color: "hsl(var(--success))" },
    { name: "Disk", data: extractSeries(metricsHistory, "disk"), color: "hsl(var(--warning))" },
  ], [metricsHistory]);

  const llmSeries = useMemo(() => [
    { name: "Latency", data: extractSeries(metricsHistory, "llm_latency"), color: "hsl(var(--warning))" },
    { name: "Tokens/s", data: extractSeries(metricsHistory, "llm_tps"), color: "hsl(var(--success))" },
    { name: "TTFT", data: extractSeries(metricsHistory, "llm_ttft"), color: "hsl(var(--info))" },
  ], [metricsHistory]);

  const alerts = monitoring?.alerts.active_alerts ?? [];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <KpiStrip
        monitoring={monitoring}
        llmGpu={llmGpu}
        agentMetrics={agentMetrics}
        liveExecutions={liveExecutions}
      />

      {/* Alerts */}
      <AlertsSection alerts={alerts} />

      {/* Charts — side by side */}
      <div className="grid gap-5 lg:grid-cols-2">
        <MetricsChart
          title="System Metrics"
          series={systemSeries}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          unit="%"
        />
        <MetricsChart
          title="LLM Performance"
          series={llmSeries}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          unit="ms"
        />
      </div>

      {/* Services + Agent throughput */}
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <ServicesPanel monitoring={monitoring} llmGpu={llmGpu} />
        <div className="rounded-xl border border-border/50 bg-card/50 p-5">
          <h3 className="text-sm font-semibold mb-4">Agent Performance — 24h</h3>
          {agentMetrics ? (
            <AgentPerformanceTable agents={agentMetrics} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
}
