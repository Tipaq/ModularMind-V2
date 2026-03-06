"use client";

import { useState } from "react";
import { XCircle } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import { DurationBadge, ChevronToggle } from "./shared";

export function ErrorCard({ activity }: { activity: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);
  const err = activity.errorData;
  const hasExpandable = !!activity.preview;

  return (
    <div className="rounded-lg overflow-hidden border border-destructive/20 bg-destructive/5">
      <button
        onClick={() => hasExpandable && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-destructive/10 transition-colors text-left"
      >
        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        <span className="text-xs font-medium truncate flex-1 text-destructive">
          {activity.label}
        </span>
        {err?.errorType && (
          <Badge variant="destructive" className="text-[10px] shrink-0">
            {err.errorType}
          </Badge>
        )}
        {err?.step && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {err.step}
          </Badge>
        )}
        <DurationBadge durationMs={activity.durationMs} />
        {hasExpandable && <ChevronToggle expanded={expanded} />}
      </button>

      {expanded && activity.preview && (
        <div className="border-t border-destructive/20 px-3 py-2">
          <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words text-destructive/80">
            {activity.preview}
          </pre>
        </div>
      )}
    </div>
  );
}
