import {
  Bot,
  Cpu,
  Wrench,
  Search,
  GitFork,
  Repeat,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Check,
  Loader2,
} from "lucide-react";
import { cn, formatDurationMs } from "@modularmind/ui";
import type { ExecutionActivity as Activity, ActivityType, ActivityStatus } from "../hooks/useExecutionActivities";

const ICONS: Record<ActivityType, typeof Bot> = {
  step: Bot,
  llm: Cpu,
  tool: Wrench,
  retrieval: Search,
  parallel: GitFork,
  loop: Repeat,
  error: AlertCircle,
  routing: ArrowRight,
  delegation: ArrowRight,
  direct_response: Sparkles,
  agent_created: Sparkles,
};

const COLORS: Record<ActivityType, string> = {
  step: "text-blue-500",
  llm: "text-purple-500",
  tool: "text-orange-500",
  retrieval: "text-cyan-500",
  parallel: "text-indigo-500",
  loop: "text-teal-500",
  error: "text-red-500",
  routing: "text-amber-500",
  delegation: "text-amber-500",
  direct_response: "text-green-500",
  agent_created: "text-violet-500",
};

function StatusIcon({ status }: { status: ActivityStatus }) {
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-red-500" />;
  return <Check className="h-3 w-3 text-green-500" />;
}

interface Props {
  activities: Activity[];
  isStreaming: boolean;
  hasContent: boolean;
}

export function ExecutionActivity({ activities, isStreaming, hasContent }: Props) {
  if (activities.length === 0 && !isStreaming) return null;

  // When not streaming: show collapsed summary
  if (!isStreaming && hasContent) {
    const llmCount = activities.filter((a) => a.type === "llm").length;
    const toolCount = activities.filter((a) => a.type === "tool").length;
    const totalMs = activities.reduce((sum, a) => sum + (a.durationMs ?? 0), 0);
    const parts: string[] = [];
    parts.push(`${activities.length} steps`);
    if (llmCount > 0) parts.push(`${llmCount} LLM`);
    if (toolCount > 0) parts.push(`${toolCount} tools`);
    if (totalMs > 0) parts.push(formatDurationMs(totalMs));

    return (
      <p className="text-xs text-muted-foreground">
        {parts.join(" \u00b7 ")}
      </p>
    );
  }

  // Streaming: show full activity list
  return (
    <div className="space-y-1.5">
      {activities.map((a) => {
        const Icon = ICONS[a.type];
        const color = COLORS[a.type];
        return (
          <div key={a.id} className="flex items-center gap-2 text-xs">
            <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
            <span className="truncate font-medium">{a.label}</span>
            {a.detail && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {a.detail}
              </span>
            )}
            <span className="ml-auto shrink-0">
              <StatusIcon status={a.status} />
            </span>
            {a.durationMs != null && a.status !== "running" && (
              <span className="shrink-0 text-muted-foreground">{formatDurationMs(a.durationMs)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
