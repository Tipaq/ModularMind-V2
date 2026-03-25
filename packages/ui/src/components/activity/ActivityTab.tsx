"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent, EngineGraph } from "@modularmind/api-client";
import { ExecutionSummaryHeader, computeSummary } from "./ExecutionSummaryHeader";
import { ExecutionTimeline } from "./ExecutionTimeline";

export interface ActivityTabProps {
  activities: ExecutionActivity[];
  isStreaming: boolean;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  enabledAgents: EngineAgent[];
  enabledGraphs: EngineGraph[];
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Activity className="h-5 w-5 mb-2 opacity-30" />
      <p className="text-xs text-center px-4">Send a message to see execution activity.</p>
    </div>
  );
}

export function ActivityTab({
  activities,
  isStreaming,
  tokenUsage,
  enabledAgents,
  enabledGraphs,
}: ActivityTabProps) {
  const summary = useMemo(
    () => computeSummary(activities, tokenUsage),
    [activities, tokenUsage],
  );

  if (!activities.length && !tokenUsage) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col">
      {(activities.length > 0 || tokenUsage) && (
        <ExecutionSummaryHeader summary={summary} isStreaming={isStreaming} />
      )}

      <ExecutionTimeline
        activities={activities}
        enabledAgents={enabledAgents}
        enabledGraphs={enabledGraphs}
        isStreaming={isStreaming}
      />
    </div>
  );
}
