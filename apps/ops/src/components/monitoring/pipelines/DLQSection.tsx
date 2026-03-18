"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import type { DLQMessage } from "@modularmind/api-client";
import { filterDLQByDomain, type DLQDomain, DLQ_DOMAIN_LABELS } from "../../../lib/dlqDomains";

// ── DLQ Message Row ──────────────────────────────────────────

function DLQMessageRow({ msg }: { msg: DLQMessage }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border/30 last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2 font-mono text-xs">{msg.original_stream}</td>
        <td className="px-4 py-2 text-xs text-muted-foreground max-w-[300px] truncate">
          {msg.error}
        </td>
        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{msg.id}</td>
        <td className="px-4 py-2 text-muted-foreground">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/30">
          <td colSpan={4} className="px-4 py-3 bg-muted/20">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Error</p>
                <pre className="text-xs whitespace-pre-wrap break-all font-mono text-destructive bg-destructive/5 rounded-md p-2">
                  {msg.error}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Data Payload</p>
                <pre className="text-xs whitespace-pre-wrap break-all font-mono text-muted-foreground bg-muted/30 rounded-md p-2 max-h-40 overflow-y-auto">
                  {msg.data}
                </pre>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Original Stream: <code className="font-mono text-foreground">{msg.original_stream}</code></span>
                <span>Original ID: <code className="font-mono text-foreground">{msg.original_id}</code></span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── DLQ Section ──────────────────────────────────────────────

export interface DLQSectionProps {
  /** All DLQ messages (will be filtered if domain is provided). */
  dlqMessages: DLQMessage[];
  /** Filter to a specific business domain. If omitted, shows all messages. */
  domain?: DLQDomain;
  /** Callback to retry N messages. If provided, shows retry button. */
  onRetryBatch?: (count: number) => Promise<void>;
}

export function DLQSection({ dlqMessages, domain, onRetryBatch }: DLQSectionProps) {
  const [retrying, setRetrying] = useState(false);

  const filtered = domain ? filterDLQByDomain(dlqMessages, domain) : dlqMessages;

  if (filtered.length === 0) return null;

  const label = domain ? `${DLQ_DOMAIN_LABELS[domain]} DLQ` : "Dead Letter Queue";

  const handleRetry = async (count: number) => {
    if (!onRetryBatch || retrying) return;
    setRetrying(true);
    try {
      await onRetryBatch(count);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          {label} — {filtered.length} message{filtered.length !== 1 ? "s" : ""}
        </h2>
        {onRetryBatch && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRetry(Math.min(filtered.length, 5))}
              disabled={retrying}
              className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {retrying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Retry {Math.min(filtered.length, 5)}
            </button>
            {filtered.length > 5 && (
              <button
                onClick={() => handleRetry(filtered.length)}
                disabled={retrying}
                className="flex items-center gap-1.5 rounded-md bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/20 transition-colors disabled:opacity-50"
              >
                Retry All ({filtered.length})
              </button>
            )}
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-destructive/20 bg-card/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Stream</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Error</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">ID</th>
              <th className="px-4 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 20).map((msg) => (
              <DLQMessageRow key={msg.id} msg={msg} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {filtered.length > 20 ? `Showing 20 of ${filtered.length} messages. ` : ""}
        Click a row to expand error details and data payload.
      </p>
    </section>
  );
}
