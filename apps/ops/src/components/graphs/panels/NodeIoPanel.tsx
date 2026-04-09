import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { formatModelName, formatDurationMs } from "@modularmind/ui";
import type { ExecutionActivity } from "@modularmind/ui";

export function findActivityForNode(
  activities: ExecutionActivity[],
  nodeId: string,
): ExecutionActivity | null {
  for (const activity of activities) {
    if (activity.nodeId === nodeId) return activity;
    if (activity.children) {
      const found = findActivityForNode(activity.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function ActivityStepRow({ child }: { child: ExecutionActivity }) {
  return (
    <div className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        {child.status === "completed" && <CheckCircle2 className="h-3 w-3 text-success shrink-0" />}
        {child.status === "failed" && <XCircle className="h-3 w-3 text-destructive shrink-0" />}
        {child.status === "running" && <Clock className="h-3 w-3 text-primary animate-pulse shrink-0" />}
        <span className="truncate">{child.label}</span>
      </div>
      {child.durationMs != null && (
        <span className="text-muted-foreground shrink-0 ml-2">
          {formatDurationMs(child.durationMs)}
        </span>
      )}
    </div>
  );
}

interface NodeIoPanelProps {
  nodeActivity: ExecutionActivity | null;
}

export function NodeIoPanel({ nodeActivity }: NodeIoPanelProps) {
  if (!nodeActivity) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Info className="h-6 w-6 mb-1.5 opacity-40" />
        <p className="text-xs text-center">Run the graph to see execution data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {nodeActivity.status === "completed" && <CheckCircle2 className="h-4 w-4 text-success" />}
        {nodeActivity.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
        {nodeActivity.status === "running" && <Clock className="h-4 w-4 text-primary animate-pulse" />}
        <span className="text-sm font-medium capitalize">{nodeActivity.status}</span>
        {nodeActivity.durationMs != null && (
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDurationMs(nodeActivity.durationMs)}
          </span>
        )}
      </div>

      {nodeActivity.inputPrompt && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            <ArrowDownToLine className="h-3 w-3" />
            Input
          </div>
          <div className="text-sm bg-muted/50 rounded-md p-2.5 whitespace-pre-wrap max-h-40 overflow-auto">
            {nodeActivity.inputPrompt}
          </div>
        </div>
      )}

      {nodeActivity.agentResponse && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            <ArrowUpFromLine className="h-3 w-3" />
            Output
          </div>
          <div className="text-sm bg-muted/50 rounded-md p-2.5 max-h-40 overflow-auto whitespace-pre-wrap">
            {nodeActivity.agentResponse}
          </div>
        </div>
      )}

      {nodeActivity.model && (
        <PropRow label="Model">
          <span className="text-xs font-mono">{formatModelName(nodeActivity.model)}</span>
        </PropRow>
      )}
      {(nodeActivity.toolCallCount ?? 0) > 0 && (
        <PropRow label="Tool calls">
          <span className="text-xs">{nodeActivity.toolCallCount}</span>
        </PropRow>
      )}

      {nodeActivity.children && nodeActivity.children.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Steps
          </h4>
          <div className="space-y-1">
            {nodeActivity.children.map((child) => (
              <ActivityStepRow key={child.id} child={child} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
