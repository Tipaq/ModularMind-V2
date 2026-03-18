"use client";

import { Server, HardDrive, Cpu, Clock, Gauge } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { MonitoringData, LlmGpuData, PipelineData } from "@modularmind/api-client";
import { ServicesPanel } from "../ServicesPanel";
import { StreamsPanel } from "../StreamsPanel";
import { InfraManagementSection } from "../InfraManagementSection";

// ─── Health Summary Strip ───────────────────────────────────────────────────

function InfraHealthStrip({ monitoring }: { monitoring: MonitoringData | null }) {
  if (!monitoring) return null;

  const { system, infrastructure, scheduler } = monitoring;

  const servicesUp = [
    infrastructure.redis_healthy,
    true, // DB always assumed up if we got a response
    infrastructure.ollama_status === "ok",
    infrastructure.qdrant_status === "ok",
  ].filter(Boolean).length;
  const servicesTotal = 4;

  const uptimeHours = Math.floor(monitoring.uptime_seconds / 3600);
  const uptimeDays = Math.floor(uptimeHours / 24);
  const uptimeDisplay = uptimeDays > 0
    ? `${uptimeDays}d ${uptimeHours % 24}h`
    : `${uptimeHours}h`;

  const cards = [
    {
      label: "Services",
      value: `${servicesUp}/${servicesTotal}`,
      color: servicesUp === servicesTotal ? "text-success" : "text-warning",
      icon: Server,
      iconBg: servicesUp === servicesTotal ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
    },
    {
      label: "CPU",
      value: `${system.cpu_percent.toFixed(0)}%`,
      color: system.cpu_percent > 80 ? "text-destructive" : system.cpu_percent > 60 ? "text-warning" : "text-foreground",
      icon: Cpu,
      iconBg: "bg-info/15 text-info",
    },
    {
      label: "Memory",
      value: `${system.memory_percent.toFixed(0)}%`,
      color: system.memory_percent > 85 ? "text-destructive" : system.memory_percent > 70 ? "text-warning" : "text-foreground",
      icon: HardDrive,
      iconBg: "bg-primary/15 text-primary",
    },
    {
      label: "Disk",
      value: `${system.disk_percent.toFixed(0)}%`,
      color: system.disk_percent > 90 ? "text-destructive" : system.disk_percent > 75 ? "text-warning" : "text-foreground",
      icon: HardDrive,
      iconBg: "bg-muted text-muted-foreground",
    },
    {
      label: "Scheduler Slots",
      value: `${scheduler.active_slots}/${scheduler.global_max}`,
      color: scheduler.backpressure ? "text-warning" : "text-foreground",
      icon: Gauge,
      iconBg: scheduler.backpressure ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
    },
    {
      label: "Uptime",
      value: uptimeDisplay,
      color: "text-foreground",
      icon: Clock,
      iconBg: "bg-muted text-muted-foreground",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border/50 bg-card/50 px-4 py-3 flex items-center gap-3"
        >
          <div className={cn("rounded-lg p-2", card.iconBg)}>
            <card.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={cn("text-lg font-bold tabular-nums leading-tight", card.color)}>
              {card.value}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface InfraTabProps {
  monitoring: MonitoringData | null;
  llmGpu: LlmGpuData | null;
  pipeline: PipelineData | null;
}

export function InfraTab({ monitoring, llmGpu, pipeline }: InfraTabProps) {
  return (
    <div className="space-y-6">
      {/* Health Summary Strip */}
      <InfraHealthStrip monitoring={monitoring} />

      {/* Services */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Services</h2>
        </div>
        <ServicesPanel monitoring={monitoring} llmGpu={llmGpu} />
      </section>

      {/* Streams & Queues */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Streams & Queues</h2>
        </div>
        <StreamsPanel monitoring={monitoring} pipeline={pipeline} />
      </section>

      {/* Infrastructure Management */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Management</h2>
        </div>
        <InfraManagementSection />
      </section>
    </div>
  );
}
