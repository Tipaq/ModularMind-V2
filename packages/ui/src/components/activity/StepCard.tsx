"use client";

import { useState } from "react";
import { Bot, MessageSquare, Sparkles } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import { StatusIcon, DurationBadge, ChevronToggle } from "./shared";

export function StepCard({ activity }: { activity: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);
  const hasExpandable = !!activity.preview;

  const Icon =
    activity.type === "direct_response"
      ? MessageSquare
      : activity.type === "agent_created"
        ? Sparkles
        : Bot;

  const color =
    activity.type === "direct_response"
      ? "text-success"
      : activity.type === "agent_created"
        ? "text-primary"
        : "text-info";

  return (
    <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
      <button
        onClick={() => hasExpandable && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        <StatusIcon status={activity.status} color={color} />
        <Icon className={`h-3.5 w-3.5 ${color} shrink-0`} />
        <span className="text-xs font-medium truncate flex-1">{activity.label}</span>
        {activity.detail && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {activity.detail}
          </Badge>
        )}
        <DurationBadge durationMs={activity.durationMs} />
        {hasExpandable && <ChevronToggle expanded={expanded} />}
      </button>

      {expanded && activity.preview && (
        <div className="border-t border-border/30 px-3 py-2">
          <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words text-muted-foreground">
            {activity.preview}
          </pre>
        </div>
      )}
    </div>
  );
}
