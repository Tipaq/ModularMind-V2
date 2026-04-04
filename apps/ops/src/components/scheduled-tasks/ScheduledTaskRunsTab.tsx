import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Separator,
  formatDuration,
  relativeTime,
} from "@modularmind/ui";
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

function asUtc(dateStr: string): string {
  if (dateStr.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(dateStr)) return dateStr;
  return `${dateStr}Z`;
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(asUtc(dateStr)).toLocaleString();
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="text-sm text-right min-w-0">{children}</div>
    </div>
  );
}

function RunDetailDialog({
  run,
  isOpen,
  onOpenChange,
}: {
  run: ScheduledTaskRun;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Run Detail
            <Badge variant={STATUS_VARIANTS[run.status] || "outline"} className="text-[10px]">
              {run.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <DetailRow label="Run ID">
            <span className="font-mono text-xs">{run.id.slice(0, 8)}...</span>
          </DetailRow>
          <DetailRow label="Started">
            {formatFullDate(run.created_at)}
          </DetailRow>
          <DetailRow label="Completed">
            {formatFullDate(run.completed_at)}
          </DetailRow>
          <DetailRow label="Duration">
            {run.duration_seconds !== null ? formatDuration(run.duration_seconds) : "—"}
          </DetailRow>
          {run.execution_id && (
            <DetailRow label="Execution">
              <span className="font-mono text-xs">{run.execution_id.slice(0, 12)}...</span>
            </DetailRow>
          )}
          {run.source_type && run.source_type !== "direct" && (
            <>
              <DetailRow label="Source">{run.source_type}</DetailRow>
              {run.source_ref && (
                <DetailRow label="Ref">
                  <span className="font-mono text-xs">{run.source_ref}</span>
                </DetailRow>
              )}
            </>
          )}
        </div>

        {(run.result_summary || run.error_message) && (
          <>
            <Separator />
            <div className="space-y-2">
              {run.result_summary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Result</p>
                  <p className="text-sm bg-muted/30 rounded p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {run.result_summary}
                  </p>
                </div>
              )}
              {run.error_message && (
                <div>
                  <p className="text-xs font-medium text-destructive mb-1">Error</p>
                  <p className="text-sm bg-destructive/5 border border-destructive/20 rounded p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {run.error_message}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ScheduledTaskRunsTab({ runs, isLoading }: ScheduledTaskRunsTabProps) {
  const [selectedRun, setSelectedRun] = useState<ScheduledTaskRun | null>(null);

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
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Duration</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Started</th>
              <th className="px-4 py-3 font-medium">Summary</th>
              <th className="px-4 py-3 font-medium w-8" />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                onClick={() => setSelectedRun(run)}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <Badge
                    variant={STATUS_VARIANTS[run.status] || "outline"}
                    className="text-[10px]"
                  >
                    {run.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-xs">{run.duration_seconds !== null ? formatDuration(run.duration_seconds) : "—"}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(run.created_at)}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[300px]">
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {run.result_summary || run.error_message || "—"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRun && (
        <RunDetailDialog
          run={selectedRun}
          isOpen={!!selectedRun}
          onOpenChange={(open) => { if (!open) setSelectedRun(null); }}
        />
      )}
    </>
  );
}
