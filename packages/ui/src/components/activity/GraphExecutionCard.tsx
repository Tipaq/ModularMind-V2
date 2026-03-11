"use client";

import { useState } from "react";
import { Workflow, Settings2 } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent, EngineGraph } from "../../types/engine";
import { StatusIcon, DurationBadge, ChevronToggle } from "./shared";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { LlmCallCard } from "./LlmCallCard";
import { EnhancedToolCallCard } from "./EnhancedToolCallCard";
import { GraphDetailModal } from "./GraphDetailModal";

const CHILD_DOT: Record<string, string> = {
  agent_execution: "bg-info",
  llm: "bg-primary",
  tool: "bg-warning",
  error: "bg-destructive",
};

function renderChildCard(
  child: ExecutionActivity,
  enabledAgents: EngineAgent[],
) {
  switch (child.type) {
    case "agent_execution":
      return <AgentExecutionCard activity={child} enabledAgents={enabledAgents} />;
    case "llm":
      return <LlmCallCard activity={child} />;
    case "tool":
      return <EnhancedToolCallCard activity={child} />;
    default:
      return (
        <div className="text-xs text-muted-foreground px-2 py-1">
          {child.label}
        </div>
      );
  }
}

export function GraphExecutionCard({
  activity,
  enabledAgents,
  enabledGraphs,
}: {
  activity: ExecutionActivity;
  enabledAgents: EngineAgent[];
  enabledGraphs: EngineGraph[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const graph = enabledGraphs.find((g) => g.name === activity.graphName);
  const children = activity.children || [];

  return (
    <>
      <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        >
          <StatusIcon status={activity.status} color="text-success" />
          <Workflow className="h-3.5 w-3.5 text-success shrink-0" />
          <span className="text-xs font-medium truncate">
            {activity.graphName || activity.label}
          </span>
          <span className="flex-1" />
          <DurationBadge durationMs={activity.durationMs} />
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setModalOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                setModalOpen(true);
              }
            }}
            className="h-5 w-5 rounded-md bg-muted/50 flex items-center justify-center shrink-0 hover:bg-muted transition-colors cursor-pointer"
            title="View graph details"
          >
            <Settings2 className="h-3 w-3 text-muted-foreground" />
          </span>
          <ChevronToggle expanded={expanded} />
        </button>

        {expanded && children.length > 0 && (
          <div className="border-t border-border/30 px-2 py-2">
            <div className="space-y-1.5">
              {children.map((child, i) => (
                <div key={child.id} className="relative flex gap-2">
                  {/* Mini timeline connector */}
                  <div className="flex flex-col items-center shrink-0 w-3">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full mt-2.5 shrink-0",
                      child.status === "completed"
                        ? (CHILD_DOT[child.type] || "bg-info")
                        : child.status === "running"
                          ? cn(CHILD_DOT[child.type] || "bg-info", "animate-pulse")
                          : "bg-border",
                    )} />
                    {i < children.length - 1 && (
                      <div className="w-px flex-1 bg-border/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {renderChildCard(child, enabledAgents)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <GraphDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        graph={graph ?? null}
        activity={activity}
      />
    </>
  );
}
