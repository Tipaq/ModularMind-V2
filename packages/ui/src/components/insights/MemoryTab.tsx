"use client";

import { useState, useRef, useEffect } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Expand,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "../button";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../dialog";
import type { ContextData, KnowledgeData, KnowledgeChunk } from "../../types/chat";

// ── Types ────────────────────────────────────────────────────

export interface MemoryTabProps {
  contextData: ContextData | null;
  knowledgeData: KnowledgeData | null;
  modelContextWindow?: number | null;
  isStreaming?: boolean;
  /** Optional callback for "Compact History" action. If not provided, the button is hidden. */
  onCompact?: () => Promise<{ summary_preview: string; compacted_count: number; duration_ms: number }>;
}

// ── Helpers ──────────────────────────────────────────────────

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ── Section Header ──────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  trailing,
}: {
  icon: React.ElementType;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      {trailing}
    </div>
  );
}

// ── History Message Row ─────────────────────────────────────

function MessageRow({ msg, compact }: { msg: { role: string; content: string }; compact?: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn(
      "flex gap-2.5 items-start px-2",
      compact ? "py-1.5" : "py-2",
      isUser ? "bg-primary/5" : "bg-transparent",
    )}>
      <span className={cn(
        "shrink-0 mt-px h-4 w-4 rounded flex items-center justify-center text-[8px] font-bold uppercase",
        isUser
          ? "bg-primary/20 text-primary"
          : "bg-muted-foreground/10 text-muted-foreground",
      )}>
        {isUser ? "U" : "A"}
      </span>
      <p className={cn(
        "text-[11px] leading-relaxed flex-1",
        compact
          ? cn("line-clamp-1", isUser ? "text-foreground/80" : "text-muted-foreground")
          : cn(isUser ? "text-foreground/90" : "text-foreground/70"),
      )}>
        {msg.content}
      </p>
    </div>
  );
}

// ── History Full Modal ──────────────────────────────────────

function HistoryModal({ messages, budget }: {
  messages: Array<{ role: string; content: string }>;
  budget: { includedCount: number; totalChars: number; historyBudgetTokens?: number | null; budgetExceeded: boolean } | null;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1.5">
          <Expand className="h-3 w-3" />
          View Full History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            Conversation History
            {budget && (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {budget.includedCount} messages
                {budget.historyBudgetTokens != null && budget.historyBudgetTokens > 0 && (
                  <> &middot; {formatK(Math.round(budget.totalChars / 4))} / {formatK(budget.historyBudgetTokens)} tok</>
                )}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <div className="rounded-md border border-border/40 overflow-hidden divide-y divide-border/20">
            {messages.map((msg, i) => (
              <MessageRow key={i} msg={msg} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── History Section ─────────────────────────────────────────

function HistorySection({ contextData }: { contextData: ContextData }) {
  const history = contextData.history;
  const messages = history?.messages ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="px-4 pb-3 space-y-2">
      {history?.summary && (
        <div className="rounded-md border border-info/20 bg-info/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-info mb-1">
            Compacted Context
          </p>
          <p className="text-[11px] leading-relaxed text-foreground/80 line-clamp-4">
            {history.summary}
          </p>
        </div>
      )}

      {messages.length > 0 ? (
        <div ref={scrollRef} className="rounded-md border border-border/40 overflow-hidden divide-y divide-border/20 max-h-[200px] overflow-y-auto">
          {messages.map((msg, i) => (
            <MessageRow key={i} msg={msg} compact />
          ))}
        </div>
      ) : !history?.summary ? (
        <p className="text-[11px] text-muted-foreground">No history yet.</p>
      ) : null}

      {history?.budget?.budgetExceeded && (
        <p className="text-[10px] text-warning">
          Budget exceeded — oldest messages truncated
        </p>
      )}
    </div>
  );
}

// ── Context Usage Header ────────────────────────────────────

const USAGE_LAYERS = [
  { key: "history" as const, label: "History", bg: "bg-info" },
  { key: "memory" as const, label: "Memory", bg: "bg-warning" },
  { key: "rag" as const, label: "RAG", bg: "bg-success" },
] as const;

function ContextUsageHeader({ allocated, used, cw }: {
  allocated: Record<string, number>;
  used: Record<string, number>;
  cw: number;
}) {
  if (cw <= 0) return null;
  const totalUsed = (used.history ?? 0) + (used.memory ?? 0) + (used.rag ?? 0);
  const totalAllocated = (allocated.history ?? 0) + (allocated.memory ?? 0) + (allocated.rag ?? 0);

  return (
    <div className="px-4 py-3 space-y-2 border-b border-border/50">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Injected Context
        </p>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {formatK(totalUsed)} / {formatK(totalAllocated)} tok
        </span>
      </div>

      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        {USAGE_LAYERS.map(({ key, bg }) => {
          const val = used[key] ?? 0;
          const widthPct = cw > 0 ? (val / cw) * 100 : 0;
          return widthPct > 0 ? (
            <div key={key} className={cn("h-full transition-all", bg)} style={{ width: `${widthPct}%` }} />
          ) : null;
        })}
      </div>

      {totalUsed > 0 ? (
        <div className="flex items-center gap-3 text-[10px]">
          {USAGE_LAYERS.map(({ key, label, bg }) => {
            const val = used[key] ?? 0;
            if (val <= 0) return null;
            return (
              <span key={key} className="flex items-center gap-1 text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", bg)} />
                <span className="font-mono tabular-nums">{formatK(val)}</span>
                <span className="opacity-60">{label}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">No context injected yet</p>
      )}
    </div>
  );
}

// ── Knowledge Chunk Card ─────────────────────────────────────

function KnowledgeChunkCard({ chunk }: { chunk: KnowledgeChunk }) {
  const [expanded, setExpanded] = useState(false);
  const scorePct = Math.round(chunk.score * 100);
  const scoreColor = scorePct >= 80 ? "text-success" : scorePct >= 50 ? "text-warning" : "text-muted-foreground";
  const scoreBg = scorePct >= 80 ? "bg-success" : scorePct >= 50 ? "bg-warning" : "bg-muted-foreground/40";

  return (
    <div
      className="group relative rounded-md border border-border/40 bg-card/50 hover:bg-card transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-success" />

      <div className="pl-3.5 pr-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-medium truncate flex-1">
            {chunk.documentFilename || "Unknown document"}
          </span>
          <span className={cn("text-[10px] font-mono shrink-0", scoreColor)}>{scorePct}%</span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[9px]">
          <span className="font-medium uppercase tracking-wide text-success">RAG</span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span className="text-muted-foreground/60">{chunk.collectionName}</span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span className="text-muted-foreground/60">chunk #{chunk.chunkIndex}</span>
          <div className="ml-auto flex items-center gap-1 flex-1 max-w-[60px]">
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full", scoreBg)} style={{ width: `${scorePct}%` }} />
            </div>
          </div>
        </div>

        {expanded && chunk.contentPreview && (
          <p className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words bg-muted/30 rounded px-2 py-1.5 mt-1">
            {chunk.contentPreview}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Context Tab Content ──────────────────────────────────────

export function MemoryTab({
  contextData,
  knowledgeData,
  modelContextWindow,
  isStreaming,
  onCompact,
}: MemoryTabProps) {
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateResult, setConsolidateResult] = useState<string | null>(null);

  const handleCompact = async () => {
    if (!onCompact) return;
    setConsolidating(true);
    setConsolidateResult(null);
    try {
      const data = await onCompact();
      setConsolidateResult(`Compacted ${data.compacted_count} messages (${data.duration_ms}ms)`);
    } catch {
      setConsolidateResult("Compaction failed");
    }
    setConsolidating(false);
    setTimeout(() => setConsolidateResult(null), 4000);
  };

  const bo = contextData?.budgetOverview;
  const history = contextData?.history;
  const budget = history?.budget;
  const messages = history?.messages ?? [];
  const historyTokens = budget ? Math.round(budget.totalChars / 4) : 0;
  const userProfile = contextData?.userProfile ?? null;

  const cw = modelContextWindow ?? 0;
  const allocated = {
    history: Math.round(cw * 30 / 100),
    memory: Math.round(cw * 10 / 100),
    rag: Math.round(cw * 15 / 100),
  };

  const memoryTokensUsed = bo?.layers.memory?.used ?? Math.round((userProfile?.length ?? 0) / 4);
  const ragTokensUsed = bo?.layers.rag?.used ?? Math.round((knowledgeData?.chunks ?? []).reduce((sum, c) => sum + (c.contentPreview?.length ?? 0), 0) / 4);
  const currentUsed = {
    history: bo?.layers.history?.used ?? historyTokens,
    memory: memoryTokensUsed,
    rag: ragTokensUsed,
  };

  const [lastUsed, setLastUsed] = useState({ history: 0, memory: 0, rag: 0 });
  const hasNonZero = currentUsed.history > 0 || currentUsed.memory > 0 || currentUsed.rag > 0;
  if (hasNonZero && (currentUsed.history !== lastUsed.history || currentUsed.memory !== lastUsed.memory || currentUsed.rag !== lastUsed.rag)) {
    setLastUsed(currentUsed);
  }
  const used = isStreaming && !hasNonZero
    ? lastUsed
    : currentUsed;

  return (
    <div>
      <ContextUsageHeader allocated={allocated} used={used} cw={cw} />

      <SectionHeader
        icon={Clock}
        title="History"
        trailing={
          cw > 0 ? (
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
              {formatK(used.history)} / {formatK(allocated.history)} tok
            </span>
          ) : undefined
        }
      />
      {contextData ? (
        <HistorySection contextData={contextData} />
      ) : (
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">Send a message to see history.</p>
      )}

      <div className="px-4 pb-3 space-y-1">
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <HistoryModal messages={messages} budget={budget ?? null} />
          )}
          {onCompact && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[10px] gap-1.5"
              onClick={handleCompact}
              disabled={consolidating || !contextData || isStreaming}
            >
              {consolidating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {consolidating ? "Compacting..." : "Compact History"}
            </Button>
          )}
        </div>
        {consolidateResult && (
          <p className="text-[10px] text-muted-foreground text-center">{consolidateResult}</p>
        )}
      </div>

      <div className="border-t border-border/50" />

      <SectionHeader
        icon={BookOpen}
        title="Knowledge"
        trailing={
          cw > 0 ? (
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
              {formatK(used.rag)} / {formatK(allocated.rag)} tok
            </span>
          ) : undefined
        }
      />
      <div className="px-4 pb-3">
        {knowledgeData && knowledgeData.chunks.length > 0 ? (
          <div className="space-y-1.5">
            {knowledgeData.chunks.map((chunk) => (
              <KnowledgeChunkCard key={chunk.chunkId} chunk={chunk} />
            ))}
          </div>
        ) : isStreaming ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching knowledge base…
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">No knowledge retrieved for this message.</p>
        )}
      </div>
    </div>
  );
}
