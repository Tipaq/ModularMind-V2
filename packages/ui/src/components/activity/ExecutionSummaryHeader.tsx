"use client";

import { useState, useEffect, useRef } from "react";
import {
  Clock,
  Brain,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "../badge";
import { cn } from "../../lib/utils";
import type { ExecutionActivity } from "../../types/chat";
import { formatK } from "./shared";

export interface ExecutionSummary {
  totalDurationMs: number | null;
  earliestStartedAt: number | null;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  tokensPerSecond: number | null;
  llmCalls: number;
  toolCalls: number;
  stepCount: number;
  overallStatus: "running" | "completed" | "failed";
}

export function computeSummary(
  activities: ExecutionActivity[],
  tokenUsage: { prompt: number; completion: number; total: number } | null,
): ExecutionSummary {
  // Flatten all nested children (graph → agent → llm/tool) for counting
  const allActivities: ExecutionActivity[] = [];
  const collect = (list: ExecutionActivity[]) => {
    for (const a of list) {
      allActivities.push(a);
      if (a.children?.length) collect(a.children);
    }
  };
  collect(activities);
  const llmActivities = allActivities.filter((a) => a.type === "llm");
  const toolActivities = allActivities.filter((a) => a.type === "tool");

  // Find earliest start across all activities
  const withStart = allActivities.filter((a) => a.startedAt > 0);
  const earliestStartedAt = withStart.length > 0
    ? Math.min(...withStart.map((a) => a.startedAt))
    : null;

  // Total duration: from earliest start to latest end
  let totalDurationMs: number | null = null;
  const hasRunning = allActivities.some((a) => a.status === "running");
  if (!hasRunning) {
    // All done — compute from earliest start to latest completion
    const withDuration = allActivities.filter(
      (a) => a.startedAt > 0 && a.durationMs != null && a.durationMs > 0,
    );
    if (withDuration.length > 0 && earliestStartedAt) {
      const latestEnd = Math.max(
        ...withDuration.map((a) => a.startedAt + (a.durationMs || 0)),
      );
      totalDurationMs = latestEnd - earliestStartedAt;
    }
  }

  const llmDurationMs = llmActivities.reduce((sum, a) => sum + (a.durationMs || 0), 0);
  let tokensPerSecond: number | null = null;
  if (tokenUsage && llmDurationMs > 0) {
    tokensPerSecond = Math.round(tokenUsage.completion / (llmDurationMs / 1000));
  }

  const hasFailed = allActivities.some((a) => a.status === "failed");
  const overallStatus = hasRunning ? "running" : hasFailed ? "failed" : "completed";

  return {
    totalDurationMs,
    earliestStartedAt,
    tokenUsage,
    tokensPerSecond,
    llmCalls: llmActivities.length,
    toolCalls: toolActivities.length,
    stepCount: activities.length,
    overallStatus,
  };
}

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  running: "default",
  completed: "secondary",
  failed: "destructive",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function LiveTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  const rafRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    rafRef.current = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 100);
    return () => clearInterval(rafRef.current);
  }, [startedAt]);

  return (
    <span className="font-mono font-medium tabular-nums">
      {formatDuration(elapsed)}
    </span>
  );
}

export function ExecutionSummaryHeader({
  summary,
  isStreaming,
}: {
  summary: ExecutionSummary;
  isStreaming: boolean;
}) {
  const status = isStreaming ? "running" : summary.overallStatus;
  const isRunning = status === "running";

  return (
    <div className="mx-4 mt-3 mb-1 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant={STATUS_VARIANT[status]} className="text-[10px] h-5">
          {isRunning && (
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse inline-block" />
          )}
          {status}
        </Badge>

        <div className="flex items-center gap-1 text-[11px]">
          <Clock className={cn("h-3 w-3", isRunning ? "text-primary" : "text-muted-foreground")} />
          {isRunning && summary.earliestStartedAt ? (
            <LiveTimer startedAt={summary.earliestStartedAt} />
          ) : summary.totalDurationMs != null ? (
            <span className="font-mono font-medium">
              {formatDuration(summary.totalDurationMs)}
            </span>
          ) : (
            <span className="font-mono text-muted-foreground">—</span>
          )}
        </div>

        {summary.tokenUsage && (
          <div className="flex items-center gap-1 text-[11px]">
            <Zap className="h-3 w-3 text-warning" />
            <span className="font-mono">{formatK(summary.tokenUsage.total)}</span>
            <span className="text-[10px] text-muted-foreground">tok</span>
            {summary.tokensPerSecond != null && (
              <span className="text-[10px] text-muted-foreground">
                ({summary.tokensPerSecond} t/s)
              </span>
            )}
          </div>
        )}

        {summary.llmCalls > 0 && (
          <div className="flex items-center gap-1 text-[11px]">
            <Brain className={cn("h-3 w-3 text-primary")} />
            <span className="font-mono">{summary.llmCalls}</span>
          </div>
        )}

        {summary.toolCalls > 0 && (
          <div className="flex items-center gap-1 text-[11px]">
            <Wrench className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{summary.toolCalls}</span>
          </div>
        )}
      </div>
    </div>
  );
}
