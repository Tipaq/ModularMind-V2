"use client";

import { Activity, Clock, Cpu, HardDrive, MemoryStick, Radio, Zap } from "lucide-react";
import { cn, formatDuration } from "@modularmind/ui";
import type { AlertItem, MonitoringData, PipelineData } from "@modularmind/api-client";

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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress?: { value: number; color: string };
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
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

interface Props {
  monitoring: MonitoringData | null;
  pipeline: PipelineData | null;
}

export function OverviewTab({ monitoring, pipeline }: Props) {
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
          />
          <StatTile
            icon={<MemoryStick className="h-4 w-4 text-primary" />}
            label="Memory"
            value={monitoring ? `${monitoring.system.memory_percent.toFixed(1)}%` : "--"}
            progress={monitoring ? { value: monitoring.system.memory_percent, color: "bg-primary" } : undefined}
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
          {/* Active Executions — needs custom tile for backpressure badge */}
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
          />

          <StatTile
            icon={<Radio className="h-4 w-4 text-info" />}
            label="SSE Streams"
            value={monitoring ? String(monitoring.streaming.active_streams) : "--"}
            sub={monitoring ? "active connections" : undefined}
          />
        </div>
      </section>

      {/* Pipeline Health */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Pipeline Health</h2>
        {pipeline ? (
          <>
            {Object.keys(pipeline).length === 0 ? (
              <p className="text-sm text-muted-foreground">No active streams</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stream</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Pending</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Consumers</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Lag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(pipeline).map(([name, info]) => (
                      <tr key={name} className="border-b border-border/30 last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">{name}</td>
                        <td className="px-4 py-3 text-right">{info.length}</td>
                        <td className="px-4 py-3 text-right">{info.consumers}</td>
                        <td className="px-4 py-3 text-right">{info.lag}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
