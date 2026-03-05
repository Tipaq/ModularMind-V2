"use client";

import {
  ArrowRight,
  Brain,
  Loader2,
  Zap,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import type { PipelinesData, StreamDetail } from "@modularmind/api-client";

// ── Sub-components ───────────────────────────────────────────

function CountBadge({
  count,
  variant = "default",
}: {
  count: number;
  variant?: "default" | "warning" | "danger";
}) {
  const colors = {
    default: "bg-muted text-muted-foreground",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colors[variant],
      )}
    >
      {count} pending
    </span>
  );
}

function PipelineArrow() {
  return (
    <div className="flex items-center px-1">
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function PipelineStage({
  label,
  stream,
  highlight,
  throughputLabel,
}: {
  label: string;
  stream: StreamDetail | null;
  highlight?: boolean;
  throughputLabel?: string;
}) {
  const pending = stream?.groups.reduce((sum, g) => sum + g.pending, 0) ?? 0;
  const consumers = stream?.groups.reduce((sum, g) => sum + g.consumers, 0) ?? 0;
  const variant = pending > 10 ? "danger" : pending > 0 ? "warning" : "default";
  const hasConsumers = consumers > 0;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-4 py-3 min-w-[120px]",
        highlight ? "border-primary/50 bg-primary/5" : "border-border/50 bg-card/50",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-lg font-bold">{stream?.length ?? 0}</span>
      {pending > 0 && <CountBadge count={pending} variant={variant} />}
      <div className="flex items-center gap-1.5 mt-1">
        <span className={cn("h-1.5 w-1.5 rounded-full", hasConsumers ? "bg-success" : "bg-muted-foreground")} />
        <span className="text-[10px] text-muted-foreground">
          {consumers} consumer{consumers !== 1 ? "s" : ""}
        </span>
      </div>
      {throughputLabel && (
        <span className="text-[10px] text-muted-foreground mt-0.5">{throughputLabel}</span>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────

export interface MemoryPipelineSectionProps {
  pipelines: PipelinesData;
  actionLoading: string | null;
  onTriggerExtraction: () => void;
}

// ── Memory Pipeline Section ──────────────────────────────────

export function MemoryPipelineSection({
  pipelines,
  actionLoading,
  onTriggerExtraction,
}: MemoryPipelineSectionProps) {
  const { memory, counters } = pipelines;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Memory Pipeline
        </h2>
        <button
          onClick={onTriggerExtraction}
          disabled={actionLoading === "extract"}
          className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {actionLoading === "extract" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Trigger Extraction
        </button>
      </div>

      {/* Pipeline Flow */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-6">
        <div className="flex items-center justify-center flex-wrap gap-1">
          <PipelineStage label="Raw" stream={memory.memory_raw} />
          <PipelineArrow />
          <PipelineStage
            label="Extracted"
            stream={memory.memory_extracted}
            highlight
            throughputLabel={`${counters.facts_extracted_total} facts`}
          />
          <PipelineArrow />
          {memory.scorer_enabled && memory.memory_scored && (
            <>
              <PipelineStage label="Scored" stream={memory.memory_scored} />
              <PipelineArrow />
            </>
          )}
          <PipelineStage
            label="Embedded"
            stream={null}
            throughputLabel={`${counters.embeddings_stored_total} stored`}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Entries" value={memory.total_entries} />
        <StatCard label="Avg Importance" value={memory.avg_importance.toFixed(3)} />
        <StatCard label="Facts Extracted" value={counters.facts_extracted_total} />
        <StatCard label="Embeddings Stored" value={counters.embeddings_stored_total} />
      </div>

      {/* By Tier / By Type */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <p className="text-sm font-medium mb-2">By Tier</p>
          <div className="space-y-1">
            {Object.entries(memory.entries_by_tier).map(([tier, count]) => (
              <div key={tier} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">{tier}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <p className="text-sm font-medium mb-2">By Type</p>
          <div className="space-y-1">
            {Object.entries(memory.entries_by_type).map(([type, count]) => (
              <div key={type} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">{type}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
