"use client";

import { useMemo } from "react";
import { Activity, AlertCircle, Cpu, DollarSign, Gauge, HardDrive, MemoryStick, Monitor, Zap } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { AgentMetrics, LiveExecutionsData, MonitoringData, LlmGpuData } from "@modularmind/api-client";
import { estimateCost, formatCostUSD } from "../../lib/tokenPricing";
import { thresholdColor, thresholdBarColor } from "../../lib/monitoringUtils";

function MiniBar({ value, warn, crit }: { value: number; warn?: number; crit?: number }) {
  return (
    <div className="h-1 w-full rounded-full bg-muted mt-1.5">
      <div
        className={cn("h-1 rounded-full transition-all", thresholdBarColor(value, warn, crit))}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  bar,
  colorValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bar?: { value: number; warn?: number; crit?: number };
  colorValue?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-xl font-bold tabular-nums", colorValue)}>{value}</p>
      {bar && <MiniBar value={bar.value} warn={bar.warn} crit={bar.crit} />}
    </div>
  );
}

interface KpiStripProps {
  monitoring: MonitoringData | null;
  llmGpu: LlmGpuData | null;
  agentMetrics?: AgentMetrics[] | null;
  liveExecutions?: LiveExecutionsData | null;
}

export function KpiStrip({ monitoring, llmGpu, agentMetrics, liveExecutions }: KpiStripProps) {
  const cpu = monitoring?.system.cpu_percent ?? 0;
  const mem = monitoring?.system.memory_percent ?? 0;
  const disk = monitoring?.system.disk_percent ?? 0;
  const slots = monitoring?.scheduler.active_slots ?? 0;
  const slotsMax = monitoring?.scheduler.global_max ?? 0;
  const slotsPct = slotsMax > 0 ? (slots / slotsMax) * 100 : 0;
  const queueDepth = monitoring?.worker.streams
    ? Object.values(monitoring.worker.streams).reduce((sum, s) => sum + s.length, 0)
    : 0;
  const llmLatency = llmGpu?.llm_performance.avg_latency_ms ?? 0;
  const hasLlm = (llmGpu?.llm_performance.total_requests_last_hour ?? 0) > 0;

  // GPU VRAM
  const vramPct = llmGpu?.gpu_vram.used_vram_percent ?? 0;
  const vramUsed = llmGpu?.gpu_vram.used_vram_gb ?? 0;
  const vramTotal = llmGpu?.gpu_vram.total_vram_gb ?? 0;
  const hasGpu = vramTotal > 0;

  // Global error rate from agent metrics
  const { totalRuns, totalErrors, errorRate, hasAgentData } = useMemo(() => {
    const runs = agentMetrics?.reduce((s, a) => s + a.total_executions, 0) ?? 0;
    const errors = agentMetrics?.reduce((s, a) => s + a.error_count, 0) ?? 0;
    const rate = runs > 0 ? (errors / runs) * 100 : 0;
    const hasData = (agentMetrics?.length ?? 0) > 0 && runs > 0;
    return { totalRuns: runs, totalErrors: errors, errorRate: rate, hasAgentData: hasData };
  }, [agentMetrics]);

  // Estimated cost from recent executions (last hour)
  const recentCost = useMemo(() => {
    return (liveExecutions?.recent ?? []).reduce((sum, exec) => {
      if (!exec.model) return sum;
      const cost = estimateCost(exec.model, exec.tokens_prompt, exec.tokens_completion);
      return sum + (cost ?? 0);
    }, 0);
  }, [liveExecutions]);
  const hasRecentCost = recentCost > 0;

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-9">
      <KpiCard
        icon={<Cpu className="h-3.5 w-3.5 text-info" />}
        label="CPU"
        value={monitoring ? `${cpu.toFixed(1)}%` : "--"}
        bar={monitoring ? { value: cpu } : undefined}
        colorValue={monitoring ? thresholdColor(cpu) : undefined}
      />
      <KpiCard
        icon={<MemoryStick className="h-3.5 w-3.5 text-primary" />}
        label="RAM"
        value={monitoring ? `${mem.toFixed(1)}%` : "--"}
        bar={monitoring ? { value: mem } : undefined}
        colorValue={monitoring ? thresholdColor(mem) : undefined}
      />
      <KpiCard
        icon={<HardDrive className="h-3.5 w-3.5 text-warning" />}
        label="Disk"
        value={monitoring ? `${disk.toFixed(1)}%` : "--"}
        bar={monitoring ? { value: disk, warn: 70, crit: 90 } : undefined}
        colorValue={monitoring ? thresholdColor(disk, 70, 90) : undefined}
      />
      <KpiCard
        icon={<Monitor className="h-3.5 w-3.5 text-primary" />}
        label="GPU VRAM"
        value={hasGpu ? `${vramUsed.toFixed(1)}/${vramTotal.toFixed(0)}G` : "--"}
        bar={hasGpu ? { value: vramPct } : undefined}
        colorValue={hasGpu ? thresholdColor(vramPct) : undefined}
      />
      <KpiCard
        icon={<Activity className="h-3.5 w-3.5 text-success" />}
        label="Slots"
        value={monitoring ? `${slots}/${slotsMax}` : "--"}
        bar={monitoring ? { value: slotsPct } : undefined}
        colorValue={monitoring ? thresholdColor(slotsPct) : undefined}
      />
      <KpiCard
        icon={<Zap className="h-3.5 w-3.5 text-primary" />}
        label="Queue"
        value={monitoring ? String(queueDepth) : "--"}
        colorValue={queueDepth > 10 ? "text-destructive" : queueDepth > 0 ? "text-warning" : undefined}
      />
      <KpiCard
        icon={<Gauge className="h-3.5 w-3.5 text-info" />}
        label="LLM Lat."
        value={hasLlm ? `${llmLatency.toFixed(0)}ms` : "--"}
        colorValue={hasLlm && llmLatency > 2000 ? "text-destructive" : hasLlm && llmLatency > 1000 ? "text-warning" : undefined}
      />
      <KpiCard
        icon={<AlertCircle className="h-3.5 w-3.5 text-destructive" />}
        label="Err Rate"
        value={hasAgentData ? `${errorRate.toFixed(1)}%` : "--"}
        colorValue={hasAgentData ? thresholdColor(errorRate, 5, 15) : undefined}
      />
      <KpiCard
        icon={<DollarSign className="h-3.5 w-3.5 text-success" />}
        label="Cost (1h)"
        value={hasRecentCost ? formatCostUSD(recentCost) : "--"}
      />
    </div>
  );
}
