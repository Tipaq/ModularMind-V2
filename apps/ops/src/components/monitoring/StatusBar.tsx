"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { cn, formatDuration } from "@modularmind/ui";
import type { MonitoringData, LiveExecutionsData } from "@modularmind/api-client";

type HealthLevel = "healthy" | "degraded" | "critical";

function computeHealth(monitoring: MonitoringData): HealthLevel {
  const hasCritical = monitoring.alerts.active_alerts.some((a) => a.severity === "critical");
  if (hasCritical) return "critical";

  const infra = monitoring.infrastructure;
  const serviceDown =
    !infra.redis_healthy ||
    infra.ollama_status !== "ok" ||
    infra.qdrant_status !== "ok";

  if (serviceDown || monitoring.alerts.active_count > 0 || monitoring.scheduler.backpressure) {
    return "degraded";
  }

  return "healthy";
}

const HEALTH_CONFIG: Record<HealthLevel, { label: string; dot: string; bg: string }> = {
  healthy: {
    label: "System Healthy",
    dot: "bg-success animate-pulse",
    bg: "bg-success/5 border-success/20",
  },
  degraded: {
    label: "Degraded",
    dot: "bg-warning animate-pulse",
    bg: "bg-warning/5 border-warning/20",
  },
  critical: {
    label: "Critical",
    dot: "bg-destructive animate-pulse",
    bg: "bg-destructive/5 border-destructive/20",
  },
};

interface StatusBarProps {
  monitoring: MonitoringData | null;
  liveExecutions: LiveExecutionsData | null;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export function StatusBar({ monitoring, liveExecutions, lastUpdated, onRefresh }: StatusBarProps) {
  const health = useMemo(() => monitoring ? computeHealth(monitoring) : null, [monitoring]);
  const config = health ? HEALTH_CONFIG[health] : null;
  const alertCount = monitoring?.alerts.active_count ?? 0;
  const activeCount = liveExecutions?.total_active ?? 0;

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-3 backdrop-blur-sm",
        config?.bg ?? "bg-card/80 border-border/50",
      )}
    >
      {/* Left — health indicator */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", config?.dot ?? "bg-muted-foreground")} />
          <span className="text-sm font-semibold">{config?.label ?? "Loading..."}</span>
        </div>

        {monitoring && (
          <span className="text-xs text-muted-foreground">
            Uptime {formatDuration(monitoring.uptime_seconds)}
          </span>
        )}
      </div>

      {/* Right — badges + refresh */}
      <div className="flex items-center gap-3">
        {/* Active executions */}
        <span className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 text-xs font-medium">
          <span className={cn("h-1.5 w-1.5 rounded-full", activeCount > 0 ? "bg-success animate-pulse" : "bg-muted-foreground")} />
          {activeCount} active
        </span>

        {/* Alert count */}
        {alertCount > 0 && (
          <span className="rounded-md bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
            {alertCount} alert{alertCount > 1 ? "s" : ""}
          </span>
        )}

        {/* Last updated */}
        {lastUpdated && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {lastUpdated.toLocaleTimeString()}
          </span>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
    </div>
  );
}
