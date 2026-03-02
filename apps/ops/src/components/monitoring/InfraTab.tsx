"use client";

import { CheckCircle, XCircle } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { MonitoringData } from "@modularmind/api-client";

interface Props {
  monitoring: MonitoringData | null;
}

export function InfraTab({ monitoring }: Props) {
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Redis */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <p className="text-sm font-medium">Redis</p>
            <div className="flex items-center gap-2">
              {infrastructure.redis_healthy ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span
                className={cn(
                  "text-sm",
                  infrastructure.redis_healthy ? "text-success" : "text-destructive",
                )}
              >
                {infrastructure.redis_healthy ? "Healthy" : "Unhealthy"}
              </span>
              {infrastructure.redis_latency_ms !== null && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {infrastructure.redis_latency_ms} ms
                </span>
              )}
            </div>
          </div>

          {/* Database */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <p className="text-sm font-medium">Database</p>
            <p className="text-sm text-muted-foreground">
              Pool:{" "}
              <span className="font-medium text-foreground">{infrastructure.db_pool_size}</span>
              {" + "}
              {infrastructure.db_pool_max_overflow} overflow (configured max)
            </p>
          </div>

          {/* Ollama */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <p className="text-sm font-medium">Ollama</p>
            <div className="flex items-center gap-2">
              {infrastructure.ollama_status === "ok" ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span
                className={cn(
                  "text-sm",
                  infrastructure.ollama_status === "ok" ? "text-success" : "text-destructive",
                )}
              >
                {infrastructure.ollama_status === "ok" ? "Connected" : "Unavailable"}
              </span>
              {infrastructure.ollama_status === "ok" && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {infrastructure.ollama_models.length} installed
                </span>
              )}
            </div>
          </div>
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
