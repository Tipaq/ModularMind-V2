"use client";

import {
  AlertTriangle,
  Database,
  FileText,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import type { PipelinesData } from "@modularmind/api-client";

// ── Sub-components ───────────────────────────────────────────

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

// ── Types ────────────────────────────────────────────────────

export interface KnowledgePipelineSectionProps {
  pipelines: PipelinesData;
  actionLoading: string | null;
  onRetryDocument: (documentId: string) => void;
}

// ── Knowledge Pipeline Section ───────────────────────────────

export function KnowledgePipelineSection({
  pipelines,
  actionLoading,
  onRetryDocument,
}: KnowledgePipelineSectionProps) {
  const { knowledge } = pipelines;

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
        <Database className="h-5 w-5 text-info" />
        Document Processing Queue
      </h2>

      {/* Stream depth card */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-mono">tasks:documents</p>
            <p className="text-2xl font-bold mt-1">{knowledge.documents_stream.length}</p>
            <p className="text-xs text-muted-foreground">messages in stream</p>
          </div>
          <div className="text-right space-y-1">
            {knowledge.documents_stream.groups.length > 0 ? (
              knowledge.documents_stream.groups.map((g) => (
                <div key={g.name} className="flex items-center justify-end gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", g.consumers > 0 ? "bg-success" : "bg-muted-foreground")} />
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">{g.name}</span>: {g.pending} pending, {g.consumers} consumer{g.consumers !== 1 ? "s" : ""}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No consumer groups</span>
            )}
          </div>
        </div>
      </div>

      {/* Status Tiles */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <tr key={doc.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
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
                          : doc.status === "pending"
                            ? "bg-muted text-muted-foreground"
                            : "bg-info/15 text-info",
                      )}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] truncate">
                    {doc.error_message || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(doc.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {doc.status === "failed" && (
                      <button
                        onClick={() => onRetryDocument(doc.id)}
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
  );
}
