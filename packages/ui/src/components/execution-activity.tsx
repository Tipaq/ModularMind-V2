"use client";

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
  RefreshCw,
  Workflow,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "../lib/utils";
import { formatDurationMs } from "../lib/utils";
import { ACTIVITY_COLORS } from "../lib/colors";
import type { ExecutionActivity, ActivityType } from "../types/chat";

const MAX_VISIBLE_ACTIVITIES = 10;

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
  compaction: RefreshCw,
  agent_execution: Bot,
  graph_execution: Workflow,
};

function countActivities(activities: ExecutionActivity[]): { agents: number; llm: number; tools: number; total: number } {
  let agents = 0, llm = 0, tools = 0, total = 0;
  for (const a of activities) {
    total++;
    if (a.type === "agent_execution") agents++;
    if (a.type === "llm") llm++;
    if (a.type === "tool") tools++;
    if (a.children?.length) {
      const c = countActivities(a.children);
      agents += c.agents; llm += c.llm; tools += c.tools; total += c.total;
    }
  }
  return { agents, llm, tools, total };
}

const ActivityItem = memo(function ActivityItem({ activity }: { activity: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(activity.status === "running");
  const Icon = ACTIVITY_ICON[activity.type] || Bot;
  const color = ACTIVITY_COLORS[activity.type] || "text-muted-foreground";
  const hasChildren = (activity.children?.length ?? 0) > 0;
  const isExpandable = hasChildren || !!activity.preview;

  return (
    <div>
      <div
        className={cn("flex items-start gap-2 py-1", isExpandable && "cursor-pointer")}
        onClick={() => isExpandable && setExpanded(!expanded)}
      >
        <div className="mt-0.5">
          {activity.status === "running" ? (
            <Loader2 className={cn("h-3.5 w-3.5 animate-spin", color)} />
          ) : activity.status === "failed" ? (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <CheckCircle2 className={cn("h-3.5 w-3.5", color)} />
          )}
        </div>
        <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{activity.label}</span>
            {activity.detail && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded shrink-0">
                {activity.detail}
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
              {activity.durationMs != null ? formatDurationMs(activity.durationMs) : ""}
            </span>
            {isExpandable && (
              expanded
                ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
      {expanded && activity.preview && (
        <div className="ml-9 mb-1">
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/50 rounded p-1.5">
            {activity.preview}
          </p>
        </div>
      )}
      {expanded && hasChildren && (
        <div className="ml-6 pl-3 border-l border-border/50 space-y-0">
          {activity.children!.map((child) => (
            <ActivityItem key={child.id} activity={child} />
          ))}
        </div>
      )}
    </div>
  );
});

function renderActivityItem(activity: ExecutionActivity) {
  return <ActivityItem key={activity.id} activity={activity} />;
}

export interface ExecutionActivityListProps {
  activities: ExecutionActivity[];
  isStreaming: boolean;
  flat?: boolean;
}

export const ExecutionActivityList = memo(function ExecutionActivityList({
  activities,
  isStreaming,
  flat,
}: ExecutionActivityListProps) {
  const [expanded, setExpanded] = useState(false);
  const items = activities;

  if (items.length === 0 && !isStreaming) return null;

  if (items.length === 0 && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Thinking...
      </div>
    );
  }

  if (isStreaming) {
    const visible = items.slice(-MAX_VISIBLE_ACTIVITIES);
    const hidden = items.length - visible.length;
    return (
      <div className="space-y-0.5">
        {hidden > 0 && (
          <p className="text-[10px] text-muted-foreground mb-1">
            +{hidden} earlier steps
          </p>
        )}
        {visible.map((a) => renderActivityItem(a))}
      </div>
    );
  }

  if (flat) {
    return (
      <div className="space-y-0.5">
        {items.map((a) => renderActivityItem(a))}
      </div>
    );
  }

  const counts = countActivities(items);
  const totalMs = items.reduce((sum, a) => sum + (a.durationMs || 0), 0);
  const parts: string[] = [];
  if (counts.agents > 0) parts.push(`${counts.agents} agents`);
  else parts.push(`${counts.total} steps`);
  if (counts.llm > 0) parts.push(`${counts.llm} LLM`);
  if (counts.tools > 0) parts.push(`${counts.tools} tools`);

  return (
    <div>
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
            <span className="ml-auto text-[10px]">&middot; {formatDurationMs(totalMs)}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {items.map((a) => (
            <ActivityItem key={a.id} activity={a} />
          ))}
        </div>
      )}
    </div>
  );
});
