"use client";

import { useState } from "react";
import {
  BookOpen,
  Database,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge, cn } from "@modularmind/ui";
import type { KnowledgeData, KnowledgeChunk } from "@/hooks/useChat";

// ── Types ────────────────────────────────────────────────────

export interface KnowledgeTabProps {
  data: KnowledgeData | null;
}

// ── Empty State ──────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Icon className="h-5 w-5 mb-2 opacity-30" />
      <p className="text-xs text-center px-4">{message}</p>
    </div>
  );
}

// ── Knowledge Chunk Item ─────────────────────────────────────

function KnowledgeChunkItem({ chunk }: { chunk: KnowledgeChunk }) {
  const [expanded, setExpanded] = useState(false);
  const scorePercent = Math.round(chunk.score * 100);
  const scoreColor =
    scorePercent >= 80
      ? "text-success"
      : scorePercent >= 50
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <div
      className="border border-border/50 rounded-lg p-2.5 space-y-1.5 cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5">
        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium truncate flex-1">
          {chunk.documentFilename || "Unknown document"}
        </span>
        <span className={cn("text-[10px] font-mono shrink-0", scoreColor)}>
          {scorePercent}%
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Score bar */}
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            scorePercent >= 80
              ? "bg-success"
              : scorePercent >= 50
                ? "bg-warning"
                : "bg-muted-foreground/40",
          )}
          style={{ width: `${scorePercent}%` }}
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        {chunk.collectionName} &middot; chunk #{chunk.chunkIndex}
      </p>

      {expanded && chunk.contentPreview && (
        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/50 rounded p-1.5 mt-1">
          {chunk.contentPreview}
        </p>
      )}
    </div>
  );
}

// ── Knowledge Tab Content ────────────────────────────────────

export function KnowledgeTab({ data }: KnowledgeTabProps) {
  if (!data || data.chunks.length === 0) {
    return <EmptyState icon={BookOpen} message="No knowledge retrieved for this message." />;
  }

  return (
    <div className="p-4 space-y-3">
      {/* Collections summary */}
      {data.collections.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Collections ({data.collections.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.collections.map((c) => (
              <Badge
                key={c.collectionId}
                variant="secondary"
                className="text-[10px] gap-1"
              >
                <Database className="h-2.5 w-2.5" />
                {c.collectionName}
                <span className="text-muted-foreground">({c.chunkCount})</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Chunks */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Results ({data.totalResults})
        </p>
        <div className="space-y-1.5">
          {data.chunks.map((chunk) => (
            <KnowledgeChunkItem key={chunk.chunkId} chunk={chunk} />
          ))}
        </div>
      </div>
    </div>
  );
}
