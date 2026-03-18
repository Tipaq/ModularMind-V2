"use client";

import { Database, HardDrive, Cpu, Search, Server } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { MonitoringData, LlmGpuData } from "@modularmind/api-client";

// ─── Service Card ─────────────────────────────────────────────────────────

function ServiceCard({
  name,
  icon: Icon,
  healthy,
  latencyMs,
  details,
}: {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  healthy: boolean;
  latencyMs?: number | null;
  details?: string[];
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-colors",
      healthy
        ? "border-success/20 bg-success/5"
        : "border-destructive/30 bg-destructive/5",
    )}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "rounded-lg p-1.5",
            healthy ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{name}</p>
            {latencyMs != null && (
              <p className="text-[11px] text-muted-foreground tabular-nums">{latencyMs}ms latency</p>
            )}
          </div>
        </div>
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          healthy
            ? "bg-success/15 text-success"
            : "bg-destructive/15 text-destructive",
        )}>
          {healthy ? "OK" : "Down"}
        </span>
      </div>
      {details && details.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {details.map((d) => (
            <span key={d} className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── VRAM Bar ────────────────────────────────────────────────────────────

function VramSection({ llmGpu }: { llmGpu: LlmGpuData }) {
  const { gpu_vram } = llmGpu;
  if (gpu_vram.total_vram_gb <= 0) return null;

  const pct = gpu_vram.used_vram_percent;
  const barColor = pct >= 80 ? "bg-destructive" : pct >= 50 ? "bg-warning" : "bg-success";

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-primary/15 p-1.5 text-primary">
            <Cpu className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold">GPU VRAM</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {gpu_vram.used_vram_gb.toFixed(1)} / {gpu_vram.total_vram_gb.toFixed(1)} GB
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="h-2.5 w-full rounded-full bg-muted">
          <div
            className={cn("h-2.5 rounded-full transition-all", barColor)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="text-right text-[11px] text-muted-foreground tabular-nums">{pct.toFixed(0)}% used</p>
      </div>

      {gpu_vram.loaded_models.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {gpu_vram.loaded_models.map((m) => (
            <span
              key={m.name}
              className="rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-mono text-success"
              title={`${m.size_vram_gb.toFixed(1)} GB — ${m.quantization || "n/a"}`}
            >
              {m.name}
              <span className="ml-1 opacity-60">{m.size_vram_gb.toFixed(1)}G</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────

interface ServicesPanelProps {
  monitoring: MonitoringData | null;
  llmGpu: LlmGpuData | null;
}

export function ServicesPanel({ monitoring, llmGpu }: ServicesPanelProps) {
  if (!monitoring) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  const { infrastructure } = monitoring;

  const services = [
    {
      name: "Redis",
      icon: Database,
      healthy: infrastructure.redis_healthy,
      latencyMs: infrastructure.redis_latency_ms,
      details: [`Max ${infrastructure.redis_max_connections} conns`],
    },
    {
      name: "Database",
      icon: HardDrive,
      healthy: true,
      details: [`Pool ${infrastructure.db_pool_size}+${infrastructure.db_pool_max_overflow}`],
    },
    {
      name: "Ollama",
      icon: Server,
      healthy: infrastructure.ollama_status === "ok",
      details: infrastructure.ollama_status === "ok"
        ? [
            `${infrastructure.ollama_models.length} model${infrastructure.ollama_models.length !== 1 ? "s" : ""}`,
            ...(infrastructure.ollama_running_models.length > 0
              ? [`${infrastructure.ollama_running_models.length} running`]
              : []),
          ]
        : [],
    },
    {
      name: "Qdrant",
      icon: Search,
      healthy: infrastructure.qdrant_status === "ok",
      latencyMs: infrastructure.qdrant_latency_ms,
      details: infrastructure.qdrant_status === "ok"
        ? [`${infrastructure.qdrant_collections} collection${infrastructure.qdrant_collections !== 1 ? "s" : ""}`]
        : [],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {services.map((svc) => (
          <ServiceCard key={svc.name} {...svc} />
        ))}
      </div>
      {llmGpu && <VramSection llmGpu={llmGpu} />}
    </div>
  );
}
