import { memo, useState } from "react";
import {
  Brain,
  Wrench,
  Search,
  Bot,
  Columns2,
  Repeat,
  XCircle,
  Route,
  MessageSquare,
  Sparkles,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import type { ExecutionActivity, ActivityType } from "../hooks/useExecutionActivities";

const ACTIVITY_ICON: Record<ActivityType, React.ElementType> = {
  llm: Brain,
  tool: Wrench,
  retrieval: Search,
  step: Bot,
  parallel: Columns2,
  loop: Repeat,
  error: XCircle,
  routing: Route,
  delegation: Bot,
  direct_response: MessageSquare,
  agent_created: Sparkles,
};

const ACTIVITY_COLOR: Record<ActivityType, string> = {
  llm: "text-info",
  tool: "text-primary",
  retrieval: "text-warning",
  step: "text-success",
  parallel: "text-info",
  loop: "text-primary",
  error: "text-destructive",
  routing: "text-warning",
  delegation: "text-success",
  direct_response: "text-success",
  agent_created: "text-primary",
};

function formatDuration(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const ActivityItem = memo(function ActivityItem({ activity }: { activity: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ACTIVITY_ICON[activity.type] || Bot;
  const color = ACTIVITY_COLOR[activity.type] || "text-muted-foreground";

  return (
    <div
      className="flex items-start gap-2 py-1 cursor-pointer"
      onClick={() => activity.preview && setExpanded(!expanded)}
    >
      {/* Status indicator */}
      <div className="mt-0.5">
        {activity.status === "running" ? (
          <Loader2 className={cn("h-3.5 w-3.5 animate-spin", color)} />
        ) : activity.status === "failed" ? (
          <XCircle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <CheckCircle2 className={cn("h-3.5 w-3.5", color)} />
        )}
      </div>

      {/* Icon */}
      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", color)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{activity.label}</span>
          {activity.detail && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded shrink-0">
              {activity.detail}
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
            {formatDuration(activity.durationMs)}
          </span>
          {activity.preview && (
            expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
        </div>
        {expanded && activity.preview && (
          <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap break-words bg-muted/50 rounded p-1.5">
            {activity.preview}
          </p>
        )}
      </div>
    </div>
  );
});

interface Props {
  activities: ExecutionActivity[];
  isStreaming: boolean;
  hasContent: boolean;
}

export function ExecutionActivityList({ activities, isStreaming }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (activities.length === 0 && !isStreaming) return null;

  if (activities.length === 0 && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Thinking...
      </div>
    );
  }

  // While streaming: show last 10
  if (isStreaming) {
    const visible = activities.slice(-10);
    const hidden = activities.length - visible.length;
    return (
      <div className="space-y-0.5">
        {hidden > 0 && (
          <p className="text-[10px] text-muted-foreground mb-1">
            +{hidden} earlier steps
          </p>
        )}
        {visible.map((a) => (
          <ActivityItem key={a.id} activity={a} />
        ))}
      </div>
    );
  }

  // After completion: collapsible summary
  const llmCount = activities.filter((a) => a.type === "llm").length;
  const toolCount = activities.filter((a) => a.type === "tool").length;
  const totalMs = activities.reduce((sum, a) => sum + (a.durationMs || 0), 0);
  const parts: string[] = [];
  parts.push(`${activities.length} steps`);
  if (llmCount > 0) parts.push(`${llmCount} LLM`);
  if (toolCount > 0) parts.push(`${toolCount} tools`);

  return (
    <div>
      {/* Button mirrors ActivityItem layout: [status-col] [icon-col] [content-col] */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 py-1 w-full text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="mt-0.5 shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
        <div className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">{parts.join(", ")}</span>
            <span className="ml-auto text-[10px]">&middot; {formatDuration(totalMs)}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {activities.map((a) => (
            <ActivityItem key={a.id} activity={a} />
          ))}
        </div>
      )}
    </div>
  );
}
