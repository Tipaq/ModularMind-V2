"use client";

import { Wifi, WifiOff } from "lucide-react";
import { STATUS_COLORS } from "@modularmind/ui";

export function EngineStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.offline}`}
    >
      {status === "synced" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {status}
    </span>
  );
}
