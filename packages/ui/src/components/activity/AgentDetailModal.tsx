"use client";

import { useState } from "react";
import { Bot, Cpu, FileText, Clock, Sparkles } from "lucide-react";
import { Badge } from "../badge";
import { Separator } from "../separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../dialog";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent } from "../../types/engine";
import { DurationBadge } from "./shared";

export interface AgentDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: EngineAgent | null;
  activity: ExecutionActivity;
}

export function AgentDetailModal({
  open,
  onOpenChange,
  agent,
  activity,
}: AgentDetailModalProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const name = agent?.name || activity.agentName || "Agent";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="truncate block">{name}</span>
            </div>
            <Badge
              variant={
                activity.status === "running"
                  ? "default"
                  : activity.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
              className="text-[10px] shrink-0"
            >
              {activity.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Execution stats */}
          <div className="flex items-center gap-3 flex-wrap">
            {activity.durationMs != null && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <DurationBadge durationMs={activity.durationMs} />
              </div>
            )}
            {activity.isEphemeral && (
              <Badge variant="outline" className="text-[10px]">
                <Sparkles className="h-3 w-3 mr-1" />
                ephemeral
              </Badge>
            )}
            {activity.model && (
              <Badge variant="secondary" className="text-[10px]">
                <Cpu className="h-3 w-3 mr-1" />
                {activity.model}
              </Badge>
            )}
          </div>

          {/* Agent description */}
          {agent?.description && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Description
              </p>
              <p className="text-sm text-muted-foreground">
                {agent.description}
              </p>
            </div>
          )}

          {/* Model */}
          {agent?.model_id && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Model
              </p>
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-mono">{agent.model_id}</span>
              </div>
            </div>
          )}

          {/* System prompt */}
          {agent?.system_prompt && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  System Prompt
                </p>
                <button
                  onClick={() => setPromptExpanded(!promptExpanded)}
                  className="text-[10px] text-primary hover:underline"
                >
                  {promptExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              <pre
                className={`text-[11px] bg-muted/50 rounded-md p-2.5 whitespace-pre-wrap break-words text-muted-foreground overflow-hidden ${
                  promptExpanded ? "" : "line-clamp-4"
                }`}
              >
                {agent.system_prompt}
              </pre>
            </div>
          )}

          {/* Version */}
          {agent?.version != null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>Version {agent.version}</span>
            </div>
          )}

          <Separator />

          {/* Execution I/O */}
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Execution
            </p>

            {/* Output preview */}
            {activity.preview && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Output</p>
                <pre className="text-[11px] bg-muted/50 rounded-md p-2.5 overflow-x-auto max-h-40 whitespace-pre-wrap break-words text-muted-foreground">
                  {activity.preview}
                </pre>
              </div>
            )}

            {/* Tools used */}
            {activity.tools && activity.tools.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Tools available</p>
                <div className="flex flex-wrap gap-1">
                  {activity.tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-[10px] font-mono">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
