"use client";

import { Activity, Brain, Clock, Cpu, Database, HardDrive, MemoryStick, Radio, Zap } from "lucide-react";
import { cn, formatDuration } from "@modularmind/ui";
import type { AlertItem, MonitoringData, PipelineData } from "@modularmind/api-client";
import { Sparkline } from "./Sparkline";

type SparklineData = Array<{ ts: number; value: number }>;

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className={cn("h-2 rounded-full transition-all", color)}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function slotColor(current: number, max: number): string {
  const pct = max > 0 ? (current / max) * 100 : 0;
  if (pct >= 80) return "bg-destructive";
  if (pct >= 50) return "bg-warning";
  return "bg-success";
}

function StatTile({
  icon,
  label,
  value,
  progress,
  sub,
  sparkline,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress?: { value: number; color: string };
  sub?: string;
  sparkline?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl font-bold">{value}</p>
        {sparkline && <div className="w-24 shrink-0">{sparkline}</div>}
      </div>
      {progress && <ProgressBar value={progress.value} color={progress.color} />}
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function AlertBanner({ alert }: { alert: AlertItem }) {
  const isCritical = alert.severity === "critical";
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-3 text-sm",
        isCritical ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
      )}
    >
      <span className="font-medium">{isCritical ? "Critical" : "Warning"}:</span>{" "}
      {alert.message}
    </div>
  );
}

// ─── Queue Groups ───────────────────────────────────────────────────────────

const QUEUE_GROUPS = [
  {
    label: "Execution",
    icon: Activity,
    color: "text-primary",
    streams: [
      { key: "tasks:executions", short: "executions" },
      { key: "tasks:models", short: "models" },
    ],
  },
  {
    label: "Memory",
    icon: Brain,
    color: "text-primary",
    streams: [
      { key: "memory:raw", short: "raw" },
      { key: "memory:extracted", short: "extracted" },
      { key: "memory:scored", short: "scored" },
      { key: "dlq", short: "dlq" },
    ],
  },
  {
    label: "Knowledge",
    icon: Database,
    color: "text-info",
    streams: [
      { key: "tasks:documents", short: "documents" },
    ],
  },
];

function streamDotColor(count: number): string {
  if (count > 10) return "bg-destructive";
  if (count > 0) return "bg-warning";
  return "bg-success";
}

function QueueGroup({
  label,
  icon: Icon,
  color,
  streams,
  pipeline,
}: {
  label: string;
  icon: React.ElementType;
  color: string;
  streams: Array<{ key: string; short: string }>;
  pipeline: PipelineData;
}) {
  const total = streams.reduce((sum, s) => sum + (pipeline[s.key]?.length ?? 0), 0);

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", color)} />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        {total > 0 && (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            total > 10 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning",
          )}>
            {total}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {streams.map(({ key, short }) => {
          const info = pipeline[key];
          const count = info?.length ?? 0;
          return (
            <div key={key} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", streamDotColor(count))} />
                <span className="font-mono text-xs text-muted-foreground">{short}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums font-medium">{count}</span>
                {info && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {info.consumers}c
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface Props {
  monitoring: MonitoringData | null;
  pipeline: PipelineData | null;
  sparklines?: Record<string, SparklineData>;
}

export function OverviewTab({ monitoring, pipeline, sparklines }: Props) {
  const hasAlerts = (monitoring?.alerts.active_count ?? 0) > 0;
  const queueDepth = monitoring?.worker.streams
    ? Object.values(monitoring.worker.streams).reduce((sum, s) => sum + s.length, 0)
    : 0;

  return (
    <div className="space-y-8">
      {/* Alerts banner */}
      {hasAlerts && (
        <div className="space-y-2">
          {monitoring!.alerts.active_alerts.map((alert) => (
            <AlertBanner key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      {/* System Resources */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">System Resources</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={<Cpu className="h-4 w-4 text-info" />}
            label="CPU"
            value={monitoring ? `${monitoring.system.cpu_percent.toFixed(1)}%` : "--"}
            progress={monitoring ? { value: monitoring.system.cpu_percent, color: "bg-info" } : undefined}
            sparkline={
              sparklines?.cpu && sparklines.cpu.length > 1
                ? <Sparkline data={sparklines.cpu} color="hsl(var(--info))" name="cpu" />
                : undefined
            }
          />
          <StatTile
            icon={<MemoryStick className="h-4 w-4 text-primary" />}
            label="Memory"
            value={monitoring ? `${monitoring.system.memory_percent.toFixed(1)}%` : "--"}
            progress={monitoring ? { value: monitoring.system.memory_percent, color: "bg-primary" } : undefined}
            sparkline={
              sparklines?.memory && sparklines.memory.length > 1
                ? <Sparkline data={sparklines.memory} color="hsl(var(--primary))" name="memory" />
                : undefined
            }
          />
          <StatTile
            icon={<HardDrive className="h-4 w-4 text-warning" />}
            label="Disk"
            value={monitoring ? `${monitoring.system.disk_percent.toFixed(1)}%` : "--"}
            progress={monitoring ? { value: monitoring.system.disk_percent, color: "bg-warning" } : undefined}
          />
          <StatTile
            icon={<Clock className="h-4 w-4 text-success" />}
            label="Uptime"
            value={monitoring ? formatDuration(monitoring.uptime_seconds) : "--"}
          />
        </div>
      </section>

      {/* Live Activity */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Live Activity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Active Executions — custom tile for backpressure badge */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Active Executions</span>
            </div>
            {monitoring ? (
              <>
                <p className="text-2xl font-bold">
                  {monitoring.scheduler.active_slots}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}/ {monitoring.scheduler.global_max}
                  </span>
                </p>
                <ProgressBar
                  value={
                    monitoring.scheduler.global_max > 0
                      ? (monitoring.scheduler.active_slots / monitoring.scheduler.global_max) * 100
                      : 0
                  }
                  color={slotColor(monitoring.scheduler.active_slots, monitoring.scheduler.global_max)}
                />
                {monitoring.scheduler.backpressure && (
                  <p className="text-xs text-warning">⚠ Backpressure active</p>
                )}
              </>
            ) : (
              <p className="text-2xl font-bold">--</p>
            )}
          </div>

          <StatTile
            icon={<Zap className="h-4 w-4 text-primary" />}
            label="Queue Depth"
            value={monitoring ? String(queueDepth) : "--"}
            sub={monitoring ? "tasks pending" : undefined}
            sparkline={
              sparklines?.queue && sparklines.queue.length > 1
                ? <Sparkline data={sparklines.queue} color="hsl(var(--primary))" name="queue" />
                : undefined
            }
          />

          <StatTile
            icon={<Radio className="h-4 w-4 text-info" />}
            label="SSE Streams"
            value={monitoring ? String(monitoring.streaming.active_streams) : "--"}
            sub={monitoring ? "active connections" : undefined}
          />
        </div>
      </section>

      {/* Queues at a Glance */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Queues at a Glance</h2>
        {pipeline ? (
          <>
            {Object.keys(pipeline).length === 0 ? (
              <p className="text-sm text-muted-foreground">No active streams</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {QUEUE_GROUPS.map((group) => (
                  <QueueGroup key={group.label} {...group} pipeline={pipeline} />
                ))}
              </div>
            )}
            {(pipeline.dlq?.length ?? 0) > 0 && (
              <div className="mt-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Dead letter queue: {pipeline.dlq!.length} messages
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
            Loading pipeline data...
          </div>
        )}
      </section>
    </div>
  );
}
