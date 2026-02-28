import { Activity, Cpu, HardDrive, MemoryStick, Clock, RefreshCw } from "lucide-react";
import { cn, formatDuration } from "@modularmind/ui";
import type { SystemMetrics, WorkerStatus, PipelineHealth } from "@modularmind/api-client";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className={cn("h-2 rounded-full transition-all", color)} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

export default function Monitoring() {
  const { data: metrics, refetch: refetchMetrics } = useApi<SystemMetrics>(
    () => api.get("/internal/monitoring/metrics"),
    [],
  );
  const { data: worker, refetch: refetchWorker } = useApi<WorkerStatus>(
    () => api.get("/internal/monitoring/worker"),
    [],
  );
  const { data: pipeline, refetch: refetchPipeline } = useApi<PipelineHealth>(
    () => api.get("/internal/monitoring/pipeline"),
    [],
  );

  const refetchAll = async () => {
    await Promise.all([refetchMetrics(), refetchWorker(), refetchPipeline()]);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Activity}
        gradient="from-emerald-500 to-green-500"
        title="Monitoring"
        description="System health, resources, and pipeline status"
        actions={
          <button
            onClick={refetchAll}
            className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {/* System Resources */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">System Resources</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">CPU</span>
            </div>
            <p className="text-2xl font-bold">{metrics ? `${metrics.cpu_percent.toFixed(1)}%` : "--"}</p>
            {metrics && <ProgressBar value={metrics.cpu_percent} color="bg-blue-500" />}
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <MemoryStick className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Memory</span>
            </div>
            <p className="text-2xl font-bold">{metrics ? `${metrics.memory_percent.toFixed(1)}%` : "--"}</p>
            {metrics && <ProgressBar value={metrics.memory_percent} color="bg-purple-500" />}
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">Disk</span>
            </div>
            <p className="text-2xl font-bold">{metrics ? `${metrics.disk_percent.toFixed(1)}%` : "--"}</p>
            {metrics && <ProgressBar value={metrics.disk_percent} color="bg-orange-500" />}
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Uptime</span>
            </div>
            <p className="text-2xl font-bold">{metrics ? formatDuration(metrics.uptime_seconds) : "--"}</p>
          </div>
        </div>
      </section>

      {/* Worker */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Worker Status</h2>
        {worker ? (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className={cn("h-3 w-3 rounded-full", worker.running ? "bg-green-500" : "bg-red-500")} />
              <span className="font-medium">{worker.running ? "Running" : "Stopped"}</span>
              <span className="text-sm text-muted-foreground ml-auto">
                Uptime: {formatDuration(worker.uptime_seconds)}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Streams:</span>{" "}
                <span className="font-medium">{worker.streams.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Scheduler jobs:</span>{" "}
                <span className="font-medium">{worker.scheduler_jobs}</span>
              </div>
            </div>
            {worker.streams.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {worker.streams.map((s) => (
                  <span key={s} className="rounded-md bg-muted px-2 py-1 text-xs font-mono">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
            Loading worker status...
          </div>
        )}
      </section>

      {/* Pipeline */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Pipeline Health</h2>
        {pipeline ? (
          <div className="space-y-3">
            {Object.keys(pipeline.streams).length === 0 ? (
              <p className="text-sm text-muted-foreground">No active streams</p>
            ) : (
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
                    {Object.entries(pipeline.streams).map(([name, info]) => (
                      <tr key={name} className="border-b border-border/30">
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
            {pipeline.dlq_size > 0 && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Dead letter queue: {pipeline.dlq_size} messages
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
            Loading pipeline data...
          </div>
        )}
      </section>
    </div>
  );
}
