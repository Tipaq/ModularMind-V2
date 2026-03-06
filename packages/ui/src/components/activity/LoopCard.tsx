"use client";

import { Repeat } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import { StatusIcon, DurationBadge } from "./shared";

export function LoopCard({ activity }: { activity: ExecutionActivity }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
      <div className="flex items-center gap-2 px-3 py-2">
        <StatusIcon status={activity.status} color="text-success" />
        <Repeat className="h-3.5 w-3.5 text-success shrink-0" />
        <span className="text-xs font-medium truncate flex-1">{activity.label}</span>
        {activity.loopItems != null && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {activity.loopItems} items
          </Badge>
        )}
        {activity.loopMode && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {activity.loopMode}
          </Badge>
        )}
        <DurationBadge durationMs={activity.durationMs} />
      </div>
    </div>
  );
}
