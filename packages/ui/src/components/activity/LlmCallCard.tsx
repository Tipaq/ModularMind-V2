"use client";

import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { Badge } from "../badge";
import type { ExecutionActivity } from "../../types/chat";
import { StatusIcon, DurationBadge, ChevronToggle, formatK } from "./shared";
import { cn } from "../../lib/utils";

const ROLE_LABEL: Record<string, string> = {
  system: "system",
  human: "user",
  ai: "assistant",
};

function MessageItem({ msg }: { msg: { role: string; content: string } }) {
  const [open, setOpen] = useState(false);
  const label = ROLE_LABEL[msg.role] || msg.role;

  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left rounded px-1 -mx-1 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-muted-foreground/60 uppercase shrink-0 w-12">
          {label}
        </span>
        <span
          className={cn(
            "text-[11px] text-muted-foreground min-w-0 flex-1",
            open ? "whitespace-pre-wrap break-words leading-relaxed py-0.5" : "truncate",
          )}
        >
          {msg.content}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform self-start mt-1",
            open && "rotate-180",
          )}
        />
      </div>
    </button>
  );
}

export function LlmCallCard({ activity }: { activity: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);
  const llm = activity.llmData;
  const tokens = llm?.tokens;

  const tokPerSec =
    tokens && activity.durationMs && activity.durationMs > 0
      ? Math.round(tokens.completion / (activity.durationMs / 1000))
      : null;

  return (
    <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        <StatusIcon status={activity.status} color="text-primary" />
        <Brain className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium truncate flex-1">
          {llm?.model || activity.model || "LLM"}
        </span>
        {tokens && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {formatK(tokens.total)} tok{tokens.estimated ? "*" : ""}
          </Badge>
        )}
        <DurationBadge durationMs={activity.durationMs} />
        <ChevronToggle expanded={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-2.5">
          {tokens && (
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>
                <span className="text-[10px] opacity-60">in </span>
                <span className="font-mono">{formatK(tokens.prompt)}</span>
              </span>
              <span>
                <span className="text-[10px] opacity-60">out </span>
                <span className="font-mono">{formatK(tokens.completion)}</span>
              </span>
              <span>
                <span className="text-[10px] opacity-60">total </span>
                <span className="font-mono font-medium text-foreground">{formatK(tokens.total)}</span>
                {tokens.estimated && <span className="text-[9px] opacity-50"> est</span>}
              </span>
              {tokPerSec != null && (
                <span className="ml-auto">
                  <span className="font-mono font-medium text-foreground">{tokPerSec}</span>
                  <span className="text-[10px] opacity-60"> tok/s</span>
                </span>
              )}
            </div>
          )}

          {llm?.messages && llm.messages.length > 0 ? (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Context ({llm.messages.length})
              </span>
              <div className="space-y-1">
                {llm.messages.map((msg, i) => (
                  <MessageItem key={i} msg={msg} />
                ))}
              </div>
            </div>
          ) : llm?.messageTypes && Object.keys(llm.messageTypes).length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Messages:</span>
              {Object.entries(llm.messageTypes).map(([type, count]) => (
                <span
                  key={type}
                  className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono"
                >
                  {count} {type}
                </span>
              ))}
            </div>
          ) : llm?.messageCount ? (
            <div className="text-[11px] text-muted-foreground">
              {llm.messageCount} messages in context
            </div>
          ) : null}

          {llm?.responsePreview && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Response
              </p>
              <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto max-h-24 whitespace-pre-wrap break-words text-muted-foreground">
                {llm.responsePreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
