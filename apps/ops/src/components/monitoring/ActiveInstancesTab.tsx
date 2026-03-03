"use client";

import { cn } from "@modularmind/ui";
import type { ExecutionSummary, LiveExecutionsData } from "@modularmind/api-client";

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

function abbreviateEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 12)}@${domain}`;
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

function StatusBadge({ status }: { status: ExecutionSummary["status"] }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status] ?? "bg-muted text-muted-foreground")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status] ?? "bg-muted-foreground")} />
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ExecutionSummary["execution_type"] }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
      {type}
    </span>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function ExecutionRow({ exec }: { exec: ExecutionSummary }) {
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
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground" title={exec.model ?? undefined}>
        {exec.model ? exec.model.split(":")[0] : "—"}
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        <p className="truncate text-xs text-foreground/80" title={exec.input_preview}>
          {exec.input_preview || "—"}
        </p>
      </td>
      <td className="px-4 py-3 text-right text-xs tabular-nums">
        {formatDuration(exec.duration_seconds)}
      </td>
      <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
        {formatTokens(exec.tokens_prompt, exec.tokens_completion)}
      </td>
    </tr>
  );
}

function ExecutionTable({
  rows,
  emptyMessage,
}: {
  rows: ExecutionSummary[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Input</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Duration</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((exec) => (
            <ExecutionRow key={exec.id} exec={exec} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

interface Props {
  liveExecutions: LiveExecutionsData | null;
}

export function ActiveInstancesTab({ liveExecutions }: Props) {
  return (
    <div className="space-y-8">
      {/* Active */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Active</h2>
          {liveExecutions && (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              {liveExecutions.total_active}
            </span>
          )}
        </div>
        {!liveExecutions ? (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <ExecutionTable
            rows={liveExecutions.active}
            emptyMessage="No active executions right now."
          />
        )}
      </section>

      {/* Recent (last hour) */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Recent — last hour</h2>
        {!liveExecutions ? (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <ExecutionTable
            rows={liveExecutions.recent}
            emptyMessage="No completed executions in the last hour."
          />
        )}
      </section>
    </div>
  );
}
