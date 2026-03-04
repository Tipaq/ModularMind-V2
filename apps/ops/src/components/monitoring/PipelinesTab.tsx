"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Database,
  FileText,
  Loader2,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import type { PipelinesData, StreamDetail } from "@modularmind/api-client";
import { api } from "../../lib/api";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CountBadge({
  count,
  variant = "default",
}: {
  count: number;
  variant?: "default" | "warning" | "danger";
}) {
  const colors = {
    default: "bg-muted text-muted-foreground",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colors[variant],
      )}
    >
      {count} pending
    </span>
  );
}

function PipelineArrow() {
  return (
    <div className="flex items-center px-1">
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function PipelineStage({
  label,
  stream,
  highlight,
}: {
  label: string;
  stream: StreamDetail | null;
  highlight?: boolean;
}) {
  const pending = stream?.groups.reduce((sum, g) => sum + g.pending, 0) ?? 0;
  const variant = pending > 10 ? "danger" : pending > 0 ? "warning" : "default";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-4 py-3 min-w-[110px]",
        highlight ? "border-primary/50 bg-primary/5" : "border-border/50 bg-card/50",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-lg font-bold">{stream?.length ?? 0}</span>
      {pending > 0 && <CountBadge count={pending} variant={variant} />}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function StatusTile({
  label,
  count,
  icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", color)}>{count}</p>
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

  const { memory, knowledge, dlq_messages, counters } = pipelines;
  const dlqDepth = memory.memory_dlq.length;
  const hasDLQ = dlqDepth > 0;

  /* ---------- Action handlers ---------- */

  async function handleRetryDocument(documentId: string) {
    setActionLoading(documentId);
    try {
      await api.post(`/internal/pipelines/documents/${documentId}/retry`);
      onRefresh();
    } catch (err) {
      void err; // retry failed — silently handled
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
      void err; // purge failed — silently handled
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
      void err; // extraction trigger failed — silently handled
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-8">
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
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Memory Pipeline
          </h2>
          <button
            onClick={handleTriggerExtraction}
            disabled={actionLoading === "extract"}
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {actionLoading === "extract" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Trigger Extraction
          </button>
        </div>

        {/* Pipeline Flow */}
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <div className="flex items-center justify-center flex-wrap gap-1">
            <PipelineStage label="Raw" stream={memory.memory_raw} />
            <PipelineArrow />
            <PipelineStage label="Extracted" stream={memory.memory_extracted} highlight />
            <PipelineArrow />
            {memory.scorer_enabled && memory.memory_scored && (
              <>
                <PipelineStage label="Scored" stream={memory.memory_scored} />
                <PipelineArrow />
              </>
            )}
            <PipelineStage label="Embedded" stream={null} />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Entries" value={memory.total_entries} />
          <StatCard label="Avg Importance" value={memory.avg_importance.toFixed(3)} />
          <StatCard label="Facts Extracted" value={counters.facts_extracted_total} />
          <StatCard label="Embeddings Stored" value={counters.embeddings_stored_total} />
        </div>

        {/* By Tier / By Type */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <p className="text-sm font-medium mb-2">By Tier</p>
            <div className="space-y-1">
              {Object.entries(memory.entries_by_tier).map(([tier, count]) => (
                <div key={tier} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{tier}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <p className="text-sm font-medium mb-2">By Type</p>
            <div className="space-y-1">
              {Object.entries(memory.entries_by_type).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{type}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DLQ Messages detail */}
        {dlq_messages.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2 text-destructive">Recent DLQ Messages</p>
            <div className="overflow-x-auto rounded-xl border border-destructive/20 bg-card/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Stream</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Error</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {dlq_messages.slice(0, 10).map((msg) => (
                    <tr key={msg.id} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{msg.original_stream}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[300px] truncate">
                        {msg.error}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {msg.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ===== Knowledge Pipeline ===== */}
      <section>
        <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-info" />
          Knowledge Pipeline
        </h2>

        {/* Status Tiles */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusTile
            label="Pending"
            count={knowledge.status_counts.pending}
            icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            color="text-muted-foreground"
          />
          <StatusTile
            label="Processing"
            count={knowledge.status_counts.processing}
            icon={<Loader2 className="h-4 w-4 text-info" />}
            color="text-info"
          />
          <StatusTile
            label="Ready"
            count={knowledge.status_counts.ready}
            icon={<FileText className="h-4 w-4 text-success" />}
            color="text-success"
          />
          <StatusTile
            label="Failed"
            count={knowledge.status_counts.failed}
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            color="text-destructive"
          />
        </div>

        {/* Active Documents Table */}
        {knowledge.active_documents.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border/50 bg-card/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Filename
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Collection
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Error
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {knowledge.active_documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate">
                      {doc.filename}
                    </td>
                    <td className="px-4 py-3 text-xs">{doc.collection_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          doc.status === "failed"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-info/15 text-info",
                        )}
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] truncate">
                      {doc.error_message || "--"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(doc.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {doc.status === "failed" && (
                        <button
                          onClick={() => handleRetryDocument(doc.id)}
                          disabled={actionLoading === doc.id}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === doc.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {knowledge.active_documents.length === 0 &&
          knowledge.status_counts.total > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              All documents processed successfully.
            </p>
          )}
      </section>
    </div>
  );
}
