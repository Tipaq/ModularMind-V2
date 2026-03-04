"use client";

import { cn } from "@modularmind/ui";
import type { MonitoringData } from "@modularmind/api-client";
import { Sparkline } from "./Sparkline";

type SparklineData = Array<{ ts: number; value: number }>;

// ─── Service Card ───────────────────────────────────────────────────────────

function ServiceCard({
  name,
  healthy,
  latencyMs,
  detail,
  children,
}: {
  name: string;
  healthy: boolean;
  latencyMs?: number | null;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{name}</p>
        <div className={cn("h-2.5 w-2.5 rounded-full", healthy ? "bg-success" : "bg-destructive")} />
      </div>
      <div className="flex items-center justify-between">
        <span className={cn("text-sm", healthy ? "text-success" : "text-destructive")}>
          {healthy ? "Connected" : "Unavailable"}
        </span>
        {latencyMs != null && (
          <span className="text-xs text-muted-foreground tabular-nums">{latencyMs} ms</span>
        )}
      </div>
      {detail && (
        <p className="text-xs text-muted-foreground">{detail}</p>
      )}
      {children}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface Props {
  monitoring: MonitoringData | null;
  sparklines?: Record<string, SparklineData>;
}

export function InfraTab({ monitoring, sparklines }: Props) {
  if (!monitoring) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        Loading infrastructure data...
      </div>
    );
  }

  const { infrastructure, worker, scheduler } = monitoring;

  return (
    <div className="space-y-8">
      {/* Services */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Services</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Redis */}
          <ServiceCard
            name="Redis"
            healthy={infrastructure.redis_healthy}
            latencyMs={infrastructure.redis_latency_ms}
          >
            {sparklines?.latency && sparklines.latency.length > 1 && (
              <Sparkline data={sparklines.latency} color="hsl(var(--success))" name="redis-lat" height={28} />
            )}
          </ServiceCard>

          {/* Database */}
          <ServiceCard
            name="Database"
            healthy={true}
            detail={`Pool: ${infrastructure.db_pool_size} + ${infrastructure.db_pool_max_overflow} overflow`}
          />

          {/* Ollama */}
          <ServiceCard
            name="Ollama"
            healthy={infrastructure.ollama_status === "ok"}
            detail={
              infrastructure.ollama_status === "ok"
                ? `${infrastructure.ollama_models.length} model${infrastructure.ollama_models.length !== 1 ? "s" : ""} installed`
                : undefined
            }
          />

          {/* Qdrant */}
          <ServiceCard
            name="Qdrant"
            healthy={infrastructure.qdrant_status === "ok"}
            latencyMs={infrastructure.qdrant_latency_ms}
            detail={
              infrastructure.qdrant_status === "ok"
                ? `${infrastructure.qdrant_collections} collection${infrastructure.qdrant_collections !== 1 ? "s" : ""}`
                : undefined
            }
          />
        </div>
      </section>

      {/* Worker Streams */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Worker Streams</h2>
        <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "h-3 w-3 rounded-full",
                worker.streams ? "bg-success" : "bg-destructive",
              )}
            />
            <span className="font-medium">{worker.streams ? "Running" : "Unavailable"}</span>
            <span className="text-sm text-muted-foreground ml-auto">
              Scheduler: {scheduler.active_slots} active / {scheduler.global_max} max
            </span>
          </div>
          {worker.streams && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="pb-2 text-left font-medium text-muted-foreground">Stream</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Pending</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Consumers</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Lag</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(worker.streams).map(([name, info]) => (
                    <tr key={name} className="border-b border-border/30 last:border-0">
                      <td className="py-2 font-mono text-xs">{name}</td>
                      <td className="py-2 text-right">{info.length}</td>
                      <td className="py-2 text-right">{info.consumers}</td>
                      <td className="py-2 text-right">{info.lag}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {scheduler.backpressure && (
            <div className="rounded-lg bg-warning/10 px-4 py-2 text-sm text-warning">
              Backpressure active — scheduler at capacity
            </div>
          )}
        </div>
      </section>

      {/* Installed Models */}
      {infrastructure.ollama_models.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Installed Models</h2>
          <div className="flex flex-wrap gap-2">
            {infrastructure.ollama_models.map((name) => {
              const isRunning = infrastructure.ollama_running_models.includes(name);
              return (
                <span
                  key={name}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-mono border",
                    isRunning
                      ? "border-success/50 bg-success/10 text-success"
                      : "border-border/50 bg-muted text-muted-foreground",
                  )}
                >
                  {name}
                  {isRunning && " ●"}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">● = currently in VRAM</p>
        </section>
      )}
    </div>
  );
}
