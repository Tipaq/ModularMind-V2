"use client";

import { useState } from "react";
import { Bot, Cpu } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent } from "../../types/engine";
import { StatusIcon, DurationBadge, ChevronToggle } from "./shared";
import { AgentDetailModal } from "./AgentDetailModal";

export function DelegationCard({
  activity,
  enabledAgents,
}: {
  activity: ExecutionActivity;
  enabledAgents: EngineAgent[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const agent = enabledAgents.find((a) => a.name === activity.agentName);
  const hasExpandable = !!agent;

  return (
    <>
      <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
        <button
          onClick={() => (hasExpandable || activity.preview) && setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        >
          <StatusIcon status={activity.status} color="text-warning" />
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
            className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors cursor-pointer"
            title="View agent details"
          >
            <Bot className="h-3 w-3 text-primary" />
          </span>
          <span className="text-xs font-medium flex-1 truncate">
            {activity.agentName || "Agent"}
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
          <DurationBadge durationMs={activity.durationMs} />
          {(hasExpandable || activity.preview) && <ChevronToggle expanded={expanded} />}
        </button>

        {expanded && (
          <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
            {agent?.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                {agent.description}
              </p>
            )}
            {agent?.model_id && (
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-muted-foreground" />
                <Badge variant="secondary" className="text-[10px]">
                  {agent.model_id}
                </Badge>
              </div>
            )}
            {activity.preview && (
              <pre className="text-[11px] bg-muted/50 rounded p-1.5 overflow-x-auto max-h-24 whitespace-pre-wrap break-words text-muted-foreground">
                {activity.preview}
              </pre>
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
