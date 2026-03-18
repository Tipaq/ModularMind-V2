"use client";

import { useState } from "react";
import { cn, Tabs, TabsList, TabsTrigger, TabsContent } from "@modularmind/ui";
import type { DLQMessage, PipelineData, PipelinesData } from "@modularmind/api-client";
import { api } from "../../../lib/api";
import { countDLQByDomain } from "../../../lib/dlqDomains";
import { retryDLQBatch } from "../../../lib/monitoringUtils";
import { KnowledgePipelineSection } from "../pipelines/KnowledgePipelineSection";
import { MemoryPipelineSection } from "../pipelines/MemoryPipelineSection";
import { DLQSection } from "../pipelines/DLQSection";

// ─── Queue Summary ───────────────────────────────────────────────────────────

function QueueSummaryCard({ pipelines }: { pipelines: PipelinesData }) {
  const { knowledge, counters } = pipelines;

  const docsPending = knowledge.documents_stream.groups.reduce(
    (sum, g) => sum + g.pending, 0,
  );

  const dlqDepth = knowledge.dlq_stream
    ? knowledge.dlq_stream.groups.reduce((s: number, g: { pending: number }) => s + g.pending, 0)
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

// ─── Main ────────────────────────────────────────────────────────────────────

interface PipelinesTabProps {
  pipelines: PipelinesData | null;
  pipeline: PipelineData | null;
  dlqMessages: DLQMessage[];
  onRefresh: () => Promise<void>;
}

export function PipelinesTab({ pipelines, pipeline, dlqMessages, onRefresh }: PipelinesTabProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const dlqCounts = countDLQByDomain(dlqMessages);

  if (!pipelines) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        Loading pipeline data...
      </div>
    );
  }

  const handleRetryDocument = async (documentId: string) => {
    setActionLoading(documentId);
    try {
      await api.post(`/internal/pipelines/documents/${documentId}/retry`);
      await onRefresh();
    } catch (err) {
      console.error("[PipelinesTab] Failed to retry document:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryDLQ = (count: number) => retryDLQBatch(count, onRefresh);

  return (
    <div className="space-y-6">
      {/* Queue Summary */}
      <QueueSummaryCard pipelines={pipelines} />

      {/* Sub-tabs: Knowledge / Memory */}
      <Tabs defaultValue="knowledge">
        <TabsList>
          <TabsTrigger value="knowledge" className="gap-1.5">
            Knowledge
            {dlqCounts.knowledge > 0 && (
              <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive leading-none">
                {dlqCounts.knowledge}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5">
            Memory
            {dlqCounts.memory > 0 && (
              <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive leading-none">
                {dlqCounts.memory}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge" className="mt-6 space-y-8">
          <KnowledgePipelineSection
            pipelines={pipelines}
            actionLoading={actionLoading}
            onRetryDocument={handleRetryDocument}
          />
          <DLQSection
            dlqMessages={dlqMessages}
            domain="knowledge"
            onRetryBatch={handleRetryDLQ}
          />
        </TabsContent>

        <TabsContent value="memory" className="mt-6 space-y-8">
          <MemoryPipelineSection pipeline={pipeline} />
          <DLQSection
            dlqMessages={dlqMessages}
            domain="memory"
            onRetryBatch={handleRetryDLQ}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
