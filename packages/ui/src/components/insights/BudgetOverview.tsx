"use client";

import { Gauge } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";
import { cn } from "../../lib/utils";
import type { BudgetOverview } from "../../types/chat";

const LAYER_KEYS = ["system", "history", "memory", "rag"] as const;

const LAYER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  system: { bg: "bg-primary", text: "text-primary", label: "System" },
  history: { bg: "bg-info", text: "text-info", label: "History" },
  memory: { bg: "bg-warning", text: "text-warning", label: "Memory" },
  rag: { bg: "bg-success", text: "text-success", label: "RAG" },
};

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function getLayer(overview: BudgetOverview, key: string) {
  if (key === "system") return overview.layers.system ?? null;
  return overview.layers[key as "history" | "memory" | "rag"];
}

export function BudgetOverviewSection({ overview }: { overview: BudgetOverview }) {
  const cw = overview.contextWindow;
  const systemUsed = overview.layers.system?.used ?? 0;
  const totalUsed = systemUsed + overview.layers.history.used + overview.layers.memory.used + overview.layers.rag.used;
  const totalPct = cw > 0 ? Math.round((totalUsed / cw) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Gauge className="h-3 w-3" />
          Context window
        </span>
        <span className="font-mono font-medium text-foreground">{formatK(cw)} tok</span>
      </div>
      <div className="relative">
        <div className="flex h-2 rounded-full overflow-hidden bg-muted">
          {LAYER_KEYS.map((key) => {
            const layer = getLayer(overview, key);
            if (!layer) return null;
            const widthPct = cw > 0 ? (layer.used / cw) * 100 : 0;
            return widthPct > 0 ? (
              <div key={key} className={cn("h-full transition-all", LAYER_COLORS[key].bg)} style={{ width: `${widthPct}%` }} />
            ) : null;
          })}
        </div>
        {overview.maxPct < 100 && (
          <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${overview.maxPct}%` }} title={`Cap: ${overview.maxPct}%`} />
        )}
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{formatK(totalUsed)}</span>
          {" / "}{formatK(cw)}
        </span>
        <span className={cn("font-mono font-medium", totalPct >= 90 ? "text-destructive" : totalPct >= 70 ? "text-warning" : "text-foreground")}>
          {totalPct}%
        </span>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-2 flex-wrap">
          {LAYER_KEYS.map((key) => {
            const layer = getLayer(overview, key);
            if (!layer || layer.used <= 0) return null;
            const pct = cw > 0 ? Math.round((layer.used / cw) * 100) : 0;
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-default">
                    <span className={cn("h-1.5 w-1.5 rounded-full", LAYER_COLORS[key].bg)} />
                    <span className={cn("text-[10px] font-mono tabular-nums", LAYER_COLORS[key].text)}>
                      {formatK(layer.used)}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{pct}%</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">{LAYER_COLORS[key].label}</p>
                  <p className="text-muted-foreground">
                    {formatK(layer.used)} / {formatK(layer.allocated)} tokens ({layer.pct}% budget)
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {overview.maxPct < 100 && (
        <p className="text-[9px] text-muted-foreground/60 text-center">
          Capped at {overview.maxPct}% &middot; {formatK(overview.effectiveContext)} effective
        </p>
      )}
    </div>
  );
}
