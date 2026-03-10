"use client";

import { useState } from "react";
import { Route } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import { StatusIcon, DurationBadge, ChevronToggle } from "./shared";

const STRATEGY_VARIANT: Record<string, "default" | "secondary" | "outline" | "info" | "success"> = {
  DELEGATE_AGENT: "info",
  EXECUTE_GRAPH: "default",
  DIRECT_RESPONSE: "success",
  CREATE_AGENT: "secondary",
  MULTI_ACTION: "secondary",
  TOOL_RESPONSE: "secondary",
};

export function RoutingCard({ activity }: { activity: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);
  const routing = activity.routingData;
  const strategy = routing?.strategy || activity.detail || "";
  const strategyLabel = strategy.replace(/_/g, " ").toLowerCase();
  const variant = STRATEGY_VARIANT[strategy] || "outline";
  const isCompleted = activity.status !== "running";

  return (
    <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        <StatusIcon status={activity.status} color="text-warning" />
        <Route className="h-3.5 w-3.5 text-warning shrink-0" />
        <span className="text-xs font-medium truncate">Supervisor</span>
        <span className="flex-1" />
        <DurationBadge durationMs={activity.durationMs} />
        <ChevronToggle expanded={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
          {isCompleted && strategy && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Strategy:</span>
              <Badge variant={variant as "default"} className="text-[10px]">
                {strategyLabel}
              </Badge>
            </div>
          )}
          {routing?.confidence != null && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Confidence:</span>
              <span className="font-mono font-medium">{Math.round(routing.confidence * 100)}%</span>
            </div>
          )}
          {routing?.targetAgent && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Target:</span>
              <span className="font-medium">{routing.targetAgent}</span>
            </div>
          )}
          {routing?.targetGraph && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Graph:</span>
              <span className="font-medium">{routing.targetGraph}</span>
            </div>
          )}
          {routing?.reasoning && (
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/50 rounded p-1.5">
              {routing.reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
