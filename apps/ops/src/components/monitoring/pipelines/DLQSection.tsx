"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { DLQMessage } from "@modularmind/api-client";

// ── Types ────────────────────────────────────────────────────

export interface DLQSectionProps {
  dlqMessages: DLQMessage[];
}

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

export function DLQSection({ dlqMessages }: DLQSectionProps) {
  if (dlqMessages.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        Dead Letter Queue — {dlqMessages.length} message{dlqMessages.length !== 1 ? "s" : ""}
      </h2>
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
            {dlqMessages.slice(0, 20).map((msg) => (
              <DLQMessageRow key={msg.id} msg={msg} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Click a row to expand error details and data payload.</p>
    </section>
  );
}
