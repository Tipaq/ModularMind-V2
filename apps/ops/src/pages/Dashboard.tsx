import {
  LayoutDashboard,
  Bot,
  Layers,
  GitFork,
  BookOpen,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { cn, formatDuration, PageHeader } from "@modularmind/ui";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

interface MonitoringResponse {
  timestamp: string;
  uptime_seconds: number;
  system: {
    cpu_percent: number;
    memory_percent: number;
    disk_percent: number;
  };
  worker: Record<string, unknown>;
}

interface HealthResponse {
  status: string;
  components: {
    database?: { status: string };
    redis?: { status: string };
    qdrant?: { status: string };
    worker?: { status: string };
  };
}

interface PipelineResponse {
  memory_raw: { length: number; consumers: number; lag: number };
  memory_extracted: { length: number; consumers: number; lag: number };
  tasks_executions: { length: number; consumers: number; lag: number };
  tasks_models: { length: number; consumers: number; lag: number };
  dlq: { length: number; consumers: number; lag: number };
}

const MetricCard = memo(function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
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
});

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={cn("inline-block h-2 w-2 rounded-full", ok ? "bg-success" : "bg-destructive")} />
  );
}

export default function Dashboard() {
  const { data: monitoring } = useApi<MonitoringResponse>(
    () => api.get("/internal/monitoring"),
    [],
  );
  const { data: health } = useApi<HealthResponse>(
    () => fetch("/health").then((r) => r.json()),
    [],
  );
  const { data: pipeline } = useApi<PipelineResponse>(
    () => api.get("/report/pipeline"),
    [],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        icon={LayoutDashboard}
        gradient="from-info to-info/70"
        title="Dashboard"
        description="System overview and quick status"
      />

      {/* Infrastructure status */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
          <StatusDot ok={health?.components?.database?.status === "ok"} />
          <span className="text-sm font-medium">Database</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
          <StatusDot ok={health?.components?.redis?.status === "ok"} />
          <span className="text-sm font-medium">Redis</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
          <StatusDot ok={health?.components?.qdrant?.status === "ok"} />
          <span className="text-sm font-medium">Qdrant</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
          <StatusDot ok={health?.components?.worker?.status === "ok"} />
          <span className="text-sm font-medium">Worker</span>
        </div>
      </div>

      {/* System metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="CPU"
          value={monitoring ? `${monitoring.system.cpu_percent.toFixed(1)}%` : "--"}
          icon={Cpu}
          color="bg-info"
        />
        <MetricCard
          label="Memory"
          value={monitoring ? `${monitoring.system.memory_percent.toFixed(1)}%` : "--"}
          icon={MemoryStick}
          color="bg-primary"
        />
        <MetricCard
          label="Disk"
          value={monitoring ? `${monitoring.system.disk_percent.toFixed(1)}%` : "--"}
          icon={HardDrive}
          color="bg-warning"
        />
        <MetricCard
          label="Uptime"
          value={monitoring ? formatDuration(monitoring.uptime_seconds) : "--"}
          icon={Clock}
          color="bg-success"
        />
      </div>

      {/* Quick links */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Access</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Agents", to: "/agents", icon: Bot, color: "from-primary to-primary/70" },
            { label: "Models", to: "/models", icon: Layers, color: "from-success to-success/70" },
            { label: "Graphs", to: "/graphs", icon: GitFork, color: "from-warning to-warning/70" },
            { label: "Knowledge", to: "/knowledge", icon: BookOpen, color: "from-info to-info/70" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 hover:bg-muted/50 transition-colors"
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br", item.color)}>
                <item.icon className="h-5 w-5 text-white" />
              </div>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      {pipeline && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Pipeline Streams</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(pipeline).map(([name, info]) => (
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
          {pipeline.dlq?.length > 0 && (
            <p className="mt-2 text-sm text-destructive">Dead letter queue: {pipeline.dlq.length} messages</p>
          )}
        </div>
      )}
    </div>
  );
}
