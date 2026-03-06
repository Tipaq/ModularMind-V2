"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import { StatusIcon, DurationBadge, ChevronToggle, tryFormatJson } from "./shared";

export function EnhancedToolCallCard({ activity }: { activity: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);
  const tool = activity.toolData;
  if (!tool) return null;

  const hasExpandable = !!(tool.args || tool.result);

  return (
    <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
      <button
        onClick={() => hasExpandable && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        <StatusIcon status={activity.status} color="text-warning" />
        <Wrench className="h-3.5 w-3.5 text-warning shrink-0" />
        <span className="text-xs font-mono font-medium truncate flex-1">{tool.toolName}</span>
        {tool.serverName && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {tool.serverName}
          </Badge>
        )}
        <DurationBadge durationMs={activity.durationMs} />
        {hasExpandable && <ChevronToggle expanded={expanded} />}
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-2">
          {tool.args && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Arguments
              </p>
              <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words font-mono text-muted-foreground">
                {tryFormatJson(tool.args)}
              </pre>
            </div>
          )}
          {tool.result && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Result
              </p>
              <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words font-mono text-muted-foreground">
                {tryFormatJson(tool.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
