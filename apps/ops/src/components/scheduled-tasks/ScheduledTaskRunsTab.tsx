import { Badge } from "@modularmind/ui";
import type { ScheduledTaskRun } from "@modularmind/api-client";

interface ScheduledTaskRunsTabProps {
  runs: ScheduledTaskRun[];
  isLoading: boolean;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "outline",
  pending: "secondary",
  failed: "destructive",
  skipped: "secondary",
};

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ScheduledTaskRunsTab({ runs, isLoading }: ScheduledTaskRunsTabProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading runs...
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No runs yet. Trigger the task to see execution history.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium hidden md:table-cell">Duration</th>
            <th className="px-4 py-3 font-medium hidden lg:table-cell">Started</th>
            <th className="px-4 py-3 font-medium">Summary</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 py-3">
                <Badge
                  variant={STATUS_VARIANTS[run.status] || "outline"}
                  className="text-[10px]"
                >
                  {run.status}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-mono">{run.source_ref || "—"}</span>
              </td>
              <td className="px-4 py-3 hidden md:table-cell">
                <span className="text-xs">{formatDuration(run.duration_seconds)}</span>
              </td>
              <td className="px-4 py-3 hidden lg:table-cell">
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(run.created_at)}
                </span>
              </td>
              <td className="px-4 py-3 max-w-[300px]">
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {run.result_summary || run.error_message || "—"}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
