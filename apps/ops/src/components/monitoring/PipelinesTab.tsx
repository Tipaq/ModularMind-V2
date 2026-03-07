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
import { KnowledgePipelineSection } from "./pipelines/KnowledgePipelineSection";
import { DLQSection } from "./pipelines/DLQSection";

/* ------------------------------------------------------------------ */
/*  Queue Summary Card                                                 */
/* ------------------------------------------------------------------ */

function QueueSummaryCard({ pipelines }: { pipelines: PipelinesData }) {
  const { knowledge, counters } = pipelines;

  const docsPending = knowledge.documents_stream.groups.reduce(
    (sum, g) => sum + g.pending, 0,
  );

  const dlqDepth = knowledge.dlq_stream
    ? knowledge.dlq_stream.groups.reduce((s, g) => s + g.pending, 0)
    : 0;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5">
      <h3 className="text-sm font-semibold mb-4">Pipeline Queue Summary</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="text-center">
          <p className={cn("text-2xl font-bold", docsPending > 0 ? "text-warning" : "text-foreground")}>
            {docsPending}
          </p>
          <p className="text-xs text-muted-foreground">Docs Pending</p>
        </div>
        <div className="text-center">
          <p className={cn("text-2xl font-bold", dlqDepth > 0 ? "text-destructive" : "text-success")}>
            {dlqDepth}
          </p>
          <p className="text-xs text-muted-foreground">DLQ Messages</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{counters.total_chunks}</p>
          <p className="text-xs text-muted-foreground">Total Chunks</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{counters.total_chunk_accesses}</p>
          <p className="text-xs text-muted-foreground">Chunk Accesses</p>
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

  const { dlq_messages } = pipelines;

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

  const dlqDepth = dlq_messages?.length ?? 0;
  const hasDLQ = dlqDepth > 0;

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
