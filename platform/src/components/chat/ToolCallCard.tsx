"use client";

import { useState } from "react";
import { Wrench, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge, cn } from "@modularmind/ui";
import type { ToolCallData } from "@/hooks/useExecutionActivities";

interface ToolCallCardProps {
  toolData: ToolCallData;
  status: "running" | "completed" | "failed";
  durationMs?: number;
}

export function ToolCallCard({ toolData, status, durationMs }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        {status === "running" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
        ) : status === "failed" ? (
          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
        )}
        <Wrench className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-mono font-medium truncate">{toolData.toolName}</span>
        {toolData.serverName && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {toolData.serverName}
          </Badge>
        )}
        {durationMs != null && (
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 space-y-2">
          {toolData.args && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Arguments</p>
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
                {toolData.args}
              </pre>
            </div>
          )}
          {toolData.result && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Result</p>
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
                {toolData.result}
              </pre>
            </div>
          )}
          {!toolData.args && !toolData.result && (
            <p className="text-xs text-muted-foreground">No data available</p>
          )}
        </div>
      )}
    </div>
  );
}
