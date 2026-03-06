"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import { StatusIcon, DurationBadge, ChevronToggle } from "./shared";

export function RetrievalCard({ activity }: { activity: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);
  const hasExpandable = !!activity.query;

  return (
    <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
      <button
        onClick={() => hasExpandable && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        <StatusIcon status={activity.status} color="text-info" />
        <Search className="h-3.5 w-3.5 text-info shrink-0" />
        <span className="text-xs font-medium truncate flex-1">{activity.label}</span>
        {activity.numResults != null && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {activity.numResults} results
          </Badge>
        )}
        <DurationBadge durationMs={activity.durationMs} />
        {hasExpandable && <ChevronToggle expanded={expanded} />}
      </button>

      {expanded && activity.query && (
        <div className="border-t border-border/30 px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Query
          </p>
          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded p-1.5 break-words">
            {activity.query}
          </p>
        </div>
      )}
    </div>
  );
}
