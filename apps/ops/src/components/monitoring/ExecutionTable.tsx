"use client";

import { memo, useState } from "react";
import { Loader2, Square } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { ExecutionSummary } from "@modularmind/api-client";
import { estimateCost, formatCostUSD } from "../../lib/tokenPricing";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

function formatTokens(prompt: number, completion: number): string {
  const total = prompt + completion;
  if (total === 0) return "—";
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

export function formatTokensShort(total: number): string {
  if (total === 0) return "—";
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

export function formatDurationMs(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function abbreviateEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 12)}@${domain}`;
}

function relativeTime(isoDate: string | null): string {
  if (!isoDate) return "—";
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function modelDisplayName(model: string | null): { provider: string; name: string } | null {
  if (!model) return null;
  const parts = model.split(":");
  if (parts.length >= 2) return { provider: parts[0], name: parts.slice(1).join(":") };
  return { provider: "", name: model };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  running: "bg-success/15 text-success",
  pending: "bg-muted text-muted-foreground",
  paused: "bg-warning/15 text-warning",
  awaiting_approval: "bg-info/15 text-info",
  completed: "bg-success/10 text-success/70",
  failed: "bg-destructive/15 text-destructive",
  stopped: "bg-muted text-muted-foreground",
};

const STATUS_DOT: Record<string, string> = {
  running: "bg-success animate-pulse",
  pending: "bg-muted-foreground",
  paused: "bg-warning",
  awaiting_approval: "bg-info",
  completed: "bg-success/60",
  failed: "bg-destructive",
  stopped: "bg-muted-foreground",
};

const StatusBadge = memo(function StatusBadge({ status }: { status: ExecutionSummary["status"] }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status] ?? "bg-muted text-muted-foreground")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status] ?? "bg-muted-foreground")} />
      {status.replaceAll("_", " ")}
    </span>
  );
});

// ─── Type badge ───────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  agent: "border-info/30 bg-info/10 text-info",
  graph: "border-primary/30 bg-primary/10 text-primary",
  supervisor: "border-warning/30 bg-warning/10 text-warning",
};

const TypeBadge = memo(function TypeBadge({ type }: { type: ExecutionSummary["execution_type"] }) {
  return (
    <span className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-medium", TYPE_COLORS[type] ?? "border-border bg-muted text-muted-foreground")}>
      {type}
    </span>
  );
});

// ─── Stop Button ──────────────────────────────────────────────────────────────

function StopButton({ executionId, onStop }: { executionId: string; onStop: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false);

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await onStop(executionId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleStop}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
      title="Stop execution"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
      Stop
    </button>
  );
}

// ─── Execution Table ─────────────────────────────────────────────────────────

const ExecutionRow = memo(function ExecutionRow({
  exec,
  onStopExecution,
  showCost,
}: {
  exec: ExecutionSummary;
  onStopExecution?: (id: string) => Promise<void>;
  showCost?: boolean;
}) {
  const cost = showCost && exec.model
    ? estimateCost(exec.model, exec.tokens_prompt, exec.tokens_completion)
    : null;
  const model = modelDisplayName(exec.model);

  return (
    <tr className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <StatusBadge status={exec.status} />
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground" title={exec.user_email}>
        {abbreviateEmail(exec.user_email)}
      </td>
      <td className="px-4 py-3">
        <TypeBadge type={exec.execution_type} />
      </td>
      <td className="px-4 py-3" title={exec.model ?? undefined}>
        {model ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/60 uppercase">{model.provider}</span>
            <span className="text-xs font-mono text-muted-foreground">{model.name}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        <p className="truncate text-xs text-foreground/80" title={exec.input_preview}>
          {exec.input_preview || "—"}
        </p>
      </td>
      <td className="px-4 py-3 text-right text-xs tabular-nums">
        <div>
          {formatDuration(exec.duration_seconds)}
          {exec.status === "running" && exec.started_at && (
            <p className="text-[10px] text-muted-foreground">{relativeTime(exec.started_at)}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
        {formatTokens(exec.tokens_prompt, exec.tokens_completion)}
      </td>
      {showCost && (
        <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
          {formatCostUSD(cost)}
        </td>
      )}
      {onStopExecution && (
        <td className="px-4 py-3 text-right">
          {(exec.status === "running" || exec.status === "pending") && (
            <StopButton executionId={exec.id} onStop={onStopExecution} />
          )}
        </td>
      )}
    </tr>
  );
});

export const ExecutionTable = memo(function ExecutionTable({
  rows,
  emptyMessage,
  onStopExecution,
  showCost,
}: {
  rows: ExecutionSummary[];
  emptyMessage: string;
  onStopExecution?: (id: string) => Promise<void>;
  showCost?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">User</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Model</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Input</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Duration</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Tokens</th>
            {showCost && <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Cost</th>}
            {onStopExecution && <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((exec) => (
            <ExecutionRow
              key={exec.id}
              exec={exec}
              onStopExecution={onStopExecution}
              showCost={showCost}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});
