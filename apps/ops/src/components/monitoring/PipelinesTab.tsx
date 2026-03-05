"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import type { PipelinesData } from "@modularmind/api-client";
import { api } from "../../lib/api";
import { MemoryPipelineSection } from "./pipelines/MemoryPipelineSection";
import { KnowledgePipelineSection } from "./pipelines/KnowledgePipelineSection";
import { DLQSection } from "./pipelines/DLQSection";

/* ------------------------------------------------------------------ */
/*  Queue Summary Card                                                 */
/* ------------------------------------------------------------------ */

function QueueSummaryCard({ pipelines }: { pipelines: PipelinesData }) {
  const { memory, knowledge, counters } = pipelines;

  const memoryPending = [
    memory.memory_raw,
    memory.memory_extracted,
    memory.memory_scored,
  ]
    .filter(Boolean)
    .reduce((sum, s) => sum + (s?.groups.reduce((g, grp) => g + grp.pending, 0) ?? 0), 0);

  const docsPending = knowledge.documents_stream.groups.reduce(
    (sum, g) => sum + g.pending, 0,
  );

  const totalPending = memoryPending + docsPending;
  const dlqDepth = memory.memory_dlq.length;

  const activeQueues = [
    memory.memory_raw.length > 0,
    memory.memory_extracted.length > 0,
    memory.memory_scored && memory.memory_scored.length > 0,
    knowledge.documents_stream.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5">
      <h3 className="text-sm font-semibold mb-4">Pipeline Queue Summary</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="text-center">
          <p className={cn("text-2xl font-bold", totalPending > 0 ? "text-warning" : "text-foreground")}>
            {totalPending}
          </p>
          <p className="text-xs text-muted-foreground">Total Pending</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{activeQueues}</p>
          <p className="text-xs text-muted-foreground">Active Queues</p>
        </div>
        <div className="text-center">
          <p className={cn("text-2xl font-bold", dlqDepth > 0 ? "text-destructive" : "text-success")}>
            {dlqDepth}
          </p>
          <p className="text-xs text-muted-foreground">DLQ Messages</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{counters.facts_extracted_total}</p>
          <p className="text-xs text-muted-foreground">Facts Extracted</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  pipelines: PipelinesData | null;
  onRefresh: () => void;
}

export function PipelinesTab({ pipelines, onRefresh }: Props) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  if (!pipelines) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        Loading pipeline data...
      </div>
    );
  }

  const { memory, dlq_messages } = pipelines;
  const dlqDepth = memory.memory_dlq.length;
  const hasDLQ = dlqDepth > 0;

  /* ---------- Action handlers ---------- */

  async function handleRetryDocument(documentId: string) {
    setActionLoading(documentId);
    try {
      await api.post(`/internal/pipelines/documents/${documentId}/retry`);
      onRefresh();
    } catch (err) {
      console.error("[PipelinesTab] Failed to retry document:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePurgeDLQ() {
    setActionLoading("dlq");
    try {
      await api.post("/internal/pipelines/dlq/purge");
      onRefresh();
    } catch (err) {
      console.error("[PipelinesTab] Failed to purge DLQ:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTriggerExtraction() {
    setActionLoading("extract");
    try {
      await api.post("/internal/pipelines/memory/extract");
      onRefresh();
    } catch (err) {
      console.error("[PipelinesTab] Failed to trigger extraction:", err);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* ===== Queue Summary ===== */}
      <QueueSummaryCard pipelines={pipelines} />

      {/* ===== DLQ Warning Banner ===== */}
      {hasDLQ && (
        <div className="flex items-center justify-between rounded-lg bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">
              Dead Letter Queue: {dlqDepth} message{dlqDepth !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={handlePurgeDLQ}
            disabled={actionLoading === "dlq"}
            className="flex items-center gap-1.5 rounded-md bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50"
          >
            {actionLoading === "dlq" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Purge DLQ
          </button>
        </div>
      )}

      {/* ===== Memory Pipeline ===== */}
      <MemoryPipelineSection
        pipelines={pipelines}
        actionLoading={actionLoading}
        onTriggerExtraction={handleTriggerExtraction}
      />

      {/* ===== Document Processing Queue ===== */}
      <KnowledgePipelineSection
        pipelines={pipelines}
        actionLoading={actionLoading}
        onRetryDocument={handleRetryDocument}
      />

      {/* ===== DLQ Messages Detail ===== */}
      <DLQSection dlqMessages={dlq_messages} />
    </div>
  );
}
