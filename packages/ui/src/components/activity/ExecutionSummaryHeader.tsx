"use client";

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
  const llmActivities = activities.filter((a) => a.type === "llm");
  const toolActivities = activities.filter((a) => a.type === "tool");

  let totalDurationMs: number | null = null;
  const delegationEnd = activities.find(
    (a) => a.type === "delegation" && a.status !== "running" && a.durationMs,
  );
  const directResponse = activities.find(
    (a) => a.type === "direct_response" && a.durationMs,
  );
  if (delegationEnd?.durationMs) {
    totalDurationMs = delegationEnd.durationMs;
  } else if (directResponse?.durationMs) {
    totalDurationMs = directResponse.durationMs;
  } else {
    const withDuration = activities.filter((a) => a.startedAt && a.durationMs != null);
    if (withDuration.length > 0) {
      const earliest = Math.min(...activities.filter((a) => a.startedAt).map((a) => a.startedAt));
      const latest = Math.max(...withDuration.map((a) => a.startedAt + (a.durationMs || 0)));
      if (latest > earliest) totalDurationMs = latest - earliest;
    }
  }

  const llmDurationMs = llmActivities.reduce((sum, a) => sum + (a.durationMs || 0), 0);
  let tokensPerSecond: number | null = null;
  if (tokenUsage && llmDurationMs > 0) {
    tokensPerSecond = Math.round(tokenUsage.completion / (llmDurationMs / 1000));
  }

  const hasRunning = activities.some((a) => a.status === "running");
  const hasFailed = activities.some((a) => a.status === "failed");
  const overallStatus = hasRunning ? "running" : hasFailed ? "failed" : "completed";

  return {
    totalDurationMs,
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

export function ExecutionSummaryHeader({
  summary,
  isStreaming,
}: {
  summary: ExecutionSummary;
  isStreaming: boolean;
}) {
  const status = isStreaming ? "running" : summary.overallStatus;

  return (
    <div className="mx-4 mt-3 mb-1 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant={STATUS_VARIANT[status]} className="text-[10px] h-5">
          {status === "running" && (
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse inline-block" />
          )}
          {status}
        </Badge>

        {summary.totalDurationMs != null && (
          <div className="flex items-center gap-1 text-[11px]">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono font-medium">
              {summary.totalDurationMs < 1000
                ? `${summary.totalDurationMs}ms`
                : `${(summary.totalDurationMs / 1000).toFixed(1)}s`}
            </span>
          </div>
        )}

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
