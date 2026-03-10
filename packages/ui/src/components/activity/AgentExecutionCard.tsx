"use client";

import { useState } from "react";
import { Bot, Cpu, Settings2, ArrowRight } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent } from "../../types/engine";
import { formatModelName } from "../../lib/utils";
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
  const modelId = activity.model || agent?.model_id;

  return (
    <>
      <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
        <button
          onClick={() => setExpanded(!expanded)}
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
            title="View agent configuration"
          >
            <Settings2 className="h-3 w-3 text-muted-foreground" />
          </span>
          <ChevronToggle expanded={expanded} />
        </button>

        {expanded && (
          <div className="border-t border-border/30 px-3 py-2 space-y-2">
            {/* Model */}
            {modelId && (
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-muted-foreground shrink-0" />
                <Badge variant="secondary" className="text-[10px]">
                  {formatModelName(modelId)}
                </Badge>
              </div>
            )}

            {/* Input */}
            {activity.inputPrompt && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 text-info shrink-0" />
                  <span className="text-[10px] font-medium text-muted-foreground">Input</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 break-words">
                  {activity.inputPrompt}
                </p>
              </div>
            )}

            {/* Output */}
            {activity.agentResponse && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 text-success shrink-0 rotate-180" />
                  <span className="text-[10px] font-medium text-muted-foreground">Output</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 break-words">
                  {activity.agentResponse}
                </p>
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
