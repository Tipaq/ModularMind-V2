"use client";

import { cn } from "@modularmind/ui";
import type { LlmGpuData, LoadedModel, ModelEvent } from "@modularmind/api-client";

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

function vramColor(pct: number): string {
  if (pct >= 80) return "bg-destructive";
  if (pct >= 50) return "bg-warning";
  return "bg-success";
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "∞";
  const delta = new Date(expiresAt).getTime() - Date.now();
  if (delta <= 0) return "expired";
  const mins = Math.floor(delta / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function formatEventTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function ModelRow({ model }: { model: LoadedModel }) {
  return (
    <tr className="border-b border-border/30 last:border-0">
      <td className="px-4 py-3 font-mono text-xs">{model.name}</td>
      <td className="px-4 py-3 text-right">{model.size_vram_gb.toFixed(2)} GB</td>
      <td className="px-4 py-3 text-right text-muted-foreground">{model.quantization || "—"}</td>
      <td className="px-4 py-3 text-right text-muted-foreground">{model.family || "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatExpiry(model.expires_at)}</td>
    </tr>
  );
}

function ModelEventRow({ event }: { event: ModelEvent }) {
  const isLoad = event.type === "load";
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <span className={cn("w-4 text-center font-bold", isLoad ? "text-success" : "text-muted-foreground")}>
        {isLoad ? "↑" : "↓"}
      </span>
      <span className="font-mono text-xs flex-1 truncate">{event.model}</span>
      <span className="text-xs text-muted-foreground shrink-0">{isLoad ? "loaded" : "unloaded"}</span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{formatEventTime(event.ts)}</span>
    </div>
  );
}

interface Props {
  llmGpu: LlmGpuData | null;
}

export function LlmGpuTab({ llmGpu }: Props) {
  const hasRequests = (llmGpu?.llm_performance.total_requests_last_hour ?? 0) > 0;
  const showVram = (llmGpu?.gpu_vram.total_vram_gb ?? 0) > 0;
  const recentEvents = llmGpu?.model_events.slice(-5).reverse() ?? [];

  return (
    <div className="space-y-8">
      {/* LLM Performance */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">LLM Performance</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Avg Latency"
            value={hasRequests && llmGpu ? `${llmGpu.llm_performance.avg_latency_ms.toFixed(0)} ms` : "—"}
          />
          <StatTile
            label="Tokens / sec"
            value={hasRequests && llmGpu ? `${llmGpu.llm_performance.avg_tokens_per_second.toFixed(1)}` : "—"}
          />
          <StatTile
            label="TTFT"
            value={hasRequests && llmGpu ? `${llmGpu.llm_performance.avg_ttft_ms.toFixed(0)} ms` : "—"}
          />
          <StatTile
            label="Requests / hour"
            value={llmGpu ? String(llmGpu.llm_performance.total_requests_last_hour) : "--"}
          />
        </div>
        {!hasRequests && llmGpu && (
          <p className="mt-2 text-xs text-muted-foreground">
            No LLM calls in the last hour — stats will appear after activity.
          </p>
        )}
      </section>

      {/* VRAM */}
      {showVram && llmGpu && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">GPU VRAM</h2>
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {llmGpu.gpu_vram.used_vram_gb.toFixed(2)} GB / {llmGpu.gpu_vram.total_vram_gb.toFixed(2)} GB
              </span>
              <span className="text-muted-foreground">
                {llmGpu.gpu_vram.used_vram_percent.toFixed(1)}%
                {" — "}
                {llmGpu.gpu_vram.model_count} model{llmGpu.gpu_vram.model_count !== 1 ? "s" : ""} loaded
              </span>
            </div>
            <ProgressBar
              value={llmGpu.gpu_vram.used_vram_percent}
              color={vramColor(llmGpu.gpu_vram.used_vram_percent)}
            />
          </div>
        </section>
      )}

      {/* Loaded Models */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Models in VRAM</h2>
        {!llmGpu || llmGpu.gpu_vram.loaded_models.length === 0 ? (
          <p className="text-sm text-muted-foreground">No models currently loaded in VRAM.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">VRAM</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Quantization</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Family</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Expires</th>
                </tr>
              </thead>
              <tbody>
                {llmGpu.gpu_vram.loaded_models.map((m) => (
                  <ModelRow key={m.name} model={m} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Model Events */}
      {recentEvents.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Recent Events</h2>
          <div className="rounded-xl border border-border/50 bg-card/50 divide-y divide-border/30">
            {recentEvents.map((evt, i) => (
              <ModelEventRow key={i} event={evt} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
