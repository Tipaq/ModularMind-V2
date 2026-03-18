"use client";

import { cn } from "@modularmind/ui";
import type { MonitoringData, PipelineData } from "@modularmind/api-client";
import { dotColor } from "../../lib/monitoringUtils";

// ─── Queue Group ─────────────────────────────────────────────────────────

const QUEUE_GROUPS = [
  {
    label: "Execution",
    color: "bg-info",
    streams: [
      { key: "tasks:executions", short: "executions" },
      { key: "tasks:models", short: "models" },
    ],
  },
  {
    label: "Memory",
    color: "bg-primary",
    streams: [
      { key: "memory:raw", short: "raw" },
      { key: "memory:extracted", short: "extracted" },
      { key: "memory:scored", short: "scored" },
      { key: "dlq", short: "dlq" },
    ],
  },
  {
    label: "Knowledge",
    color: "bg-warning",
    streams: [{ key: "tasks:documents", short: "documents" }],
  },
];


// ─── Stream Row with Bar ────────────────────────────────────────────────

function StreamRow({
  name,
  count,
  consumers,
  maxCount,
}: {
  name: string;
  count: number;
  consumers?: number;
  maxCount: number;
}) {
  const barPct = maxCount > 0 ? Math.min((count / maxCount) * 100, 100) : 0;

  return (
    <div className="group flex items-center gap-3 py-1.5">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColor(count))} />
      <span className="w-20 truncate text-xs font-mono text-muted-foreground">{name}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted">
        <div
          className={cn("h-1.5 rounded-full transition-all", dotColor(count))}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums font-medium">{count}</span>
      {consumers != null && (
        <span className="w-8 text-right text-[10px] text-muted-foreground tabular-nums">
          {consumers}c
        </span>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────

interface StreamsPanelProps {
  monitoring: MonitoringData | null;
  pipeline: PipelineData | null;
}

export function StreamsPanel({ monitoring, pipeline }: StreamsPanelProps) {
  if (!monitoring || !pipeline) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  const { worker, scheduler } = monitoring;

  // Compute global max for bar scaling
  const allCounts = QUEUE_GROUPS.flatMap((g) =>
    g.streams.map((s) => pipeline[s.key]?.length ?? 0),
  );
  const globalMax = Math.max(1, ...allCounts);

  return (
    <div className="space-y-4">
      {/* Scheduler summary */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Scheduler</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", worker.streams ? "bg-success" : "bg-destructive")} />
              <span className="text-xs text-muted-foreground">
                Worker {worker.streams ? "connected" : "disconnected"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Slots</span>
              <span className="tabular-nums font-medium">
                {scheduler.active_slots} / {scheduler.global_max}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={cn(
                  "h-2 rounded-full transition-all",
                  scheduler.backpressure ? "bg-warning" : "bg-primary",
                )}
                style={{ width: `${scheduler.global_max > 0 ? (scheduler.active_slots / scheduler.global_max) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {scheduler.backpressure && (
          <div className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning font-medium">
            Backpressure active — scheduler at capacity
          </div>
        )}
      </div>

      {/* Queue groups */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
        <h3 className="text-sm font-semibold">Streams & Queues</h3>

        {QUEUE_GROUPS.map((group) => {
          const total = group.streams.reduce(
            (sum, s) => sum + (pipeline[s.key]?.length ?? 0),
            0,
          );

          return (
            <div key={group.label}>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("h-2 w-2 rounded-sm", group.color)} />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
                {total > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      total > 10
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning",
                    )}
                  >
                    {total}
                  </span>
                )}
              </div>
              <div>
                {group.streams.map(({ key, short }) => {
                  const info = pipeline[key];
                  return (
                    <StreamRow
                      key={key}
                      name={short}
                      count={info?.length ?? 0}
                      consumers={info?.consumers}
                      maxCount={globalMax}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Worker streams */}
      {worker.streams && Object.keys(worker.streams).length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <h3 className="text-sm font-semibold mb-3">Worker Streams</h3>
          <div className="space-y-1.5">
            {Object.entries(worker.streams).map(([name, info]) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground truncate max-w-[180px]">{name}</span>
                <div className="flex items-center gap-4">
                  <span className="tabular-nums font-medium">{info.length} pending</span>
                  <span className={cn(
                    "tabular-nums",
                    info.lag > 0 ? "text-warning font-medium" : "text-muted-foreground",
                  )}>
                    {info.lag} lag
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
