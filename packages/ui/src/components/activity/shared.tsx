"use client";

import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { ActivityStatus } from "../../types/chat";

export function StatusIcon({
  status,
  color,
  className,
}: {
  status: ActivityStatus;
  color?: string;
  className?: string;
}) {
  const size = cn("h-3.5 w-3.5 shrink-0", className);
  if (status === "running") {
    return <Loader2 className={cn(size, "animate-spin", color || "text-primary")} />;
  }
  if (status === "failed") {
    return <XCircle className={cn(size, "text-destructive")} />;
  }
  return <CheckCircle2 className={cn(size, color || "text-success")} />;
}

export function DurationBadge({ durationMs }: { durationMs?: number }) {
  if (durationMs == null) return null;
  const formatted =
    durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;
  return (
    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
      {formatted}
    </span>
  );
}

export function ChevronToggle({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
  ) : (
    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
  );
}

export function tryFormatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

export function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
