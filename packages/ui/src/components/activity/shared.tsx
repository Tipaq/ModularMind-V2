"use client";

import { useState } from "react";
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

const ROLE_LABEL: Record<string, string> = {
  system: "system",
  human: "user",
  ai: "assistant",
};

export function MessageItem({ msg }: { msg: { role: string; content: string } }) {
  const [open, setOpen] = useState(false);
  const label = ROLE_LABEL[msg.role] || msg.role;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted/30 transition-colors"
      >
        <span className="text-[10px] font-mono text-muted-foreground/60 uppercase shrink-0">
          {label}
        </span>
        {!open && (
          <span className="text-[11px] text-muted-foreground truncate min-w-0 flex-1">
            {msg.content}
          </span>
        )}
        {open && <span className="flex-1" />}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="mt-0.5 mb-1 max-h-48 overflow-y-auto rounded bg-muted/20 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
            {msg.content}
          </p>
        </div>
      )}
    </div>
  );
}

