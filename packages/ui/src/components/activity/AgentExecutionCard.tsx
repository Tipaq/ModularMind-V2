"use client";

import { useState } from "react";
import { Bot, Cpu, Settings2, Wrench, Brain } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent } from "../../types/engine";
import { StatusIcon, DurationBadge, ChevronToggle } from "./shared";
import { AgentDetailModal } from "./AgentDetailModal";

export function AgentExecutionCard({
  activity,
  enabledAgents,
}: {
  activity: ExecutionActivity;
  enabledAgents: EngineAgent[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const agent = enabledAgents.find((a) => a.name === activity.agentName);
  const children = activity.children || [];
  const toolCount = children.filter((c) => c.type === "tool").length;
  const llmCount = children.filter((c) => c.type === "llm").length;
  const hasExpandable = !!agent?.description || !!activity.model;

  return (
    <>
      <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
        <button
          onClick={() => hasExpandable && setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        >
          <StatusIcon status={activity.status} color="text-info" />
          <Bot className="h-3.5 w-3.5 text-info shrink-0" />
          <span className="text-xs font-medium truncate">
            {activity.agentName || activity.label}
          </span>
          {activity.isEphemeral && (
            <Badge variant="outline" className="text-[10px] shrink-0">ephemeral</Badge>
          )}
          <Badge
            variant={activity.status === "running" ? "default" : activity.status === "failed" ? "destructive" : "secondary"}
            className="text-[10px] shrink-0"
          >
            {activity.status}
          </Badge>
          {activity.model && (
            <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
              {activity.model}
            </Badge>
          )}
          <span className="flex-1" />
          {llmCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
              <Brain className="h-3 w-3" />
              {llmCount}
            </span>
          )}
          {toolCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
              <Wrench className="h-3 w-3" />
              {toolCount}
            </span>
          )}
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
            title="View agent details"
          >
            <Settings2 className="h-3 w-3 text-muted-foreground" />
          </span>
          {hasExpandable && <ChevronToggle expanded={expanded} />}
        </button>

        {expanded && (
          <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
            {agent?.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                {agent.description}
              </p>
            )}
            {(activity.model || agent?.model_id) && (
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-muted-foreground" />
                <Badge variant="secondary" className="text-[10px]">
                  {activity.model || agent?.model_id}
                </Badge>
              </div>
            )}
          </div>
        )}
      </div>

      <AgentDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        agent={agent ?? null}
        activity={activity}
      />
    </>
  );
}
