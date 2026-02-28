import {
  LayoutDashboard,
  Activity,
  Bot,
  Layers,
  GitFork,
  BookOpen,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
} from "lucide-react";
import { cn, formatDuration } from "@modularmind/ui";
import type { SystemMetrics, WorkerStatus, PipelineHealth } from "@modularmind/api-client";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Activity;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={cn("inline-block h-2 w-2 rounded-full", ok ? "bg-green-500" : "bg-red-500")} />
  );
}

export default function Dashboard() {
  const { data: metrics } = useApi<SystemMetrics>(
    () => api.get("/internal/monitoring/metrics"),
    [],
  );
  const { data: worker } = useApi<WorkerStatus>(
    () => api.get("/internal/monitoring/worker"),
    [],
  );
  const { data: pipeline } = useApi<PipelineHealth>(
    () => api.get("/internal/monitoring/pipeline"),
    [],
  );
  const { data: health } = useApi<{ database: boolean; redis: boolean; qdrant: boolean }>(
    () => api.get("/health"),
    [],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        icon={LayoutDashboard}
        gradient="from-blue-500 to-cyan-500"
        title="Dashboard"
        description="System overview and quick status"
      />

      {/* Infrastructure status */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
          <StatusDot ok={health?.database ?? false} />
          <span className="text-sm font-medium">Database</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
          <StatusDot ok={health?.redis ?? false} />
          <span className="text-sm font-medium">Redis</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
          <StatusDot ok={health?.qdrant ?? false} />
          <span className="text-sm font-medium">Qdrant</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
          <StatusDot ok={worker?.running ?? false} />
          <span className="text-sm font-medium">Worker</span>
        </div>
      </div>

      {/* System metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="CPU"
          value={metrics ? `${metrics.cpu_percent.toFixed(1)}%` : "--"}
          icon={Cpu}
          color="bg-blue-500"
        />
        <MetricCard
          label="Memory"
          value={metrics ? `${metrics.memory_percent.toFixed(1)}%` : "--"}
          icon={MemoryStick}
          color="bg-purple-500"
        />
        <MetricCard
          label="Disk"
          value={metrics ? `${metrics.disk_percent.toFixed(1)}%` : "--"}
          icon={HardDrive}
          color="bg-orange-500"
        />
        <MetricCard
          label="Uptime"
          value={metrics ? formatDuration(metrics.uptime_seconds) : "--"}
          icon={Clock}
          color="bg-green-500"
        />
      </div>

      {/* Quick links */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Access</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Agents", to: "/agents", icon: Bot, color: "from-violet-500 to-purple-500" },
            { label: "Models", to: "/models", icon: Layers, color: "from-emerald-500 to-green-500" },
            { label: "Graphs", to: "/graphs", icon: GitFork, color: "from-amber-500 to-orange-500" },
            { label: "Knowledge", to: "/knowledge", icon: BookOpen, color: "from-blue-500 to-indigo-500" },
          ].map((item) => (
            <a
              key={item.to}
              href={`/ops${item.to}`}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 hover:bg-muted/50 transition-colors"
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br", item.color)}>
                <item.icon className="h-5 w-5 text-white" />
              </div>
              <span className="font-medium">{item.label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      {pipeline && Object.keys(pipeline.streams).length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Pipeline Streams</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(pipeline.streams).map(([name, info]) => (
              <div key={name} className="rounded-xl border border-border/50 bg-card/50 p-4">
                <p className="text-sm font-medium">{name}</p>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Pending: {info.length}</span>
                  <span>Consumers: {info.consumers}</span>
                  <span>Lag: {info.lag}</span>
                </div>
              </div>
            ))}
          </div>
          {pipeline.dlq_size > 0 && (
            <p className="mt-2 text-sm text-destructive">Dead letter queue: {pipeline.dlq_size} messages</p>
          )}
        </div>
      )}
    </div>
  );
}
