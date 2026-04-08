"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { ACTIVITY_COLORS } from "../../lib/colors";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent, EngineGraph } from "@modularmind/api-client";
import { RoutingCard } from "./RoutingCard";
import { DelegationCard } from "./DelegationCard";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { GraphExecutionCard } from "./GraphExecutionCard";
import { LlmCallCard } from "./LlmCallCard";
import { EnhancedToolCallCard } from "./EnhancedToolCallCard";
import { RetrievalCard } from "./RetrievalCard";
import { ErrorCard } from "./ErrorCard";
import { ParallelCard } from "./ParallelCard";
import { LoopCard } from "./LoopCard";
import { StepCard } from "./StepCard";

const DOT_BG: Record<string, string> = Object.fromEntries(
  Object.entries(ACTIVITY_COLORS).map(([key, textClass]) => [
    key,
    textClass.replace("text-", "bg-"),
  ]),
);
DOT_BG["graph_execution"] = "bg-success";

function TimelineItem({
  activity,
  enabledAgents,
  enabledGraphs,
  isLast,
  depth = 0,
}: {
  activity: ExecutionActivity;
  enabledAgents: EngineAgent[];
  enabledGraphs: EngineGraph[];
  isLast: boolean;
  depth?: number;
}) {
  const dotColor = DOT_BG[activity.type] || "bg-muted-foreground";
  const isNested = depth > 0;

  return (
    <div className={cn("relative flex gap-3", isNested && "ml-6")}>
      <div className="flex flex-col items-center shrink-0">
        <div
          className={cn(
            "rounded-full border-2 border-card z-10 mt-2.5",
            isNested ? "h-2 w-2" : "h-2.5 w-2.5",
            dotColor,
            activity.status === "running" && "animate-pulse",
          )}
        />
        {!isLast && (
          <div className="w-px flex-1 bg-border/40" />
        )}
      </div>

      <div className="flex-1 min-w-0 pb-2">
        {renderCard(activity, enabledAgents, enabledGraphs)}
      </div>
    </div>
  );
}

function renderCard(
  activity: ExecutionActivity,
  enabledAgents: EngineAgent[],
  enabledGraphs: EngineGraph[],
) {
  switch (activity.type) {
    case "routing":
      return <RoutingCard activity={activity} />;
    case "delegation":
      return <DelegationCard activity={activity} enabledAgents={enabledAgents} />;
    case "agent_execution":
      return <AgentExecutionCard activity={activity} enabledAgents={enabledAgents} />;
    case "graph_execution":
      return <GraphExecutionCard activity={activity} enabledAgents={enabledAgents} enabledGraphs={enabledGraphs} />;
    case "llm":
      return <LlmCallCard activity={activity} />;
    case "tool":
      return <EnhancedToolCallCard activity={activity} />;
    case "retrieval":
      return <RetrievalCard activity={activity} />;
    case "error":
      return <ErrorCard activity={activity} />;
    case "parallel":
      return <ParallelCard activity={activity} />;
    case "loop":
      return <LoopCard activity={activity} />;
    default:
      return <StepCard activity={activity} />;
  }
}

export function ExecutionTimeline(props: {
  activities: ExecutionActivity[];
  enabledAgents: EngineAgent[];
  enabledGraphs: EngineGraph[];
  isStreaming: boolean;
}) {
  const { activities, enabledAgents, enabledGraphs, isStreaming } = props;

  const items = useMemo(() => {
    const result: { activity: ExecutionActivity; depth: number }[] = [];
    for (const activity of activities) {
      result.push({ activity, depth: 0 });
      if (activity.type === "graph_execution") continue;
      if (activity.type === "agent_execution") continue;
      if (activity.children?.length) {
        for (const child of activity.children) {
          result.push({ activity: child, depth: 1 });
        }
      }
    }
    return result;
  }, [activities]);

  if (activities.length === 0 && !isStreaming) return null;

  return (
    <div className="px-4 py-2">
      {items.map(({ activity, depth }, i) => (
        <TimelineItem
          key={activity.id}
          activity={activity}
          enabledAgents={enabledAgents}
          enabledGraphs={enabledGraphs}
          isLast={i === items.length - 1 && !isStreaming}
          depth={depth}
        />
      ))}
      {isStreaming && !activities.some((a) => a.status === "running") && (
        <div className="relative flex gap-3">
          <div className="flex flex-col items-center shrink-0">
            <div className="h-2.5 w-2.5 rounded-full bg-primary/50 animate-pulse border-2 border-card z-10 mt-2.5" />
          </div>
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}
