"use client";

import { useState, useRef, useEffect } from "react";
import {
  BookOpen,
  Brain,
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
import type { InsightsMemoryEntry, ContextData, KnowledgeData, KnowledgeChunk } from "../../types/chat";

// ── Types ────────────────────────────────────────────────────

export interface MemoryTabProps {
  entries: InsightsMemoryEntry[];
  contextData: ContextData | null;
  knowledgeData: KnowledgeData | null;
  modelContextWindow?: number | null;
  isStreaming?: boolean;
  /** Optional callback for "Compact History" action. If not provided, the button is hidden. */
  onConsolidate?: () => Promise<{ decayed: number; invalidated: number; duration_ms: number }>;
}

// ── Constants ────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  cross_conversation: "Cross-conversation",
  user_profile: "User profile",
  agent: "Agent",
  conversation: "Conversation",
};

const TYPE_LABELS: Record<string, string> = {
  episodic: "Episodic",
  semantic: "Semantic",
  procedural: "Procedural",
};

const TYPE_ACCENT: Record<string, { text: string; bg: string; border: string }> = {
  episodic: { text: "text-info", bg: "bg-info", border: "border-info/20" },
  semantic: { text: "text-primary", bg: "bg-primary", border: "border-primary/20" },
  procedural: { text: "text-success", bg: "bg-success", border: "border-success/20" },
};

const TIER_LABELS: Record<string, string> = {
  vector: "Vector store",
  cache: "Cache",
  core: "Core",
};

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
      {messages.length > 0 ? (
        <div ref={scrollRef} className="rounded-md border border-border/40 overflow-hidden divide-y divide-border/20 max-h-[200px] overflow-y-auto">
          {messages.map((msg, i) => (
            <MessageRow key={i} msg={msg} compact />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No history yet.</p>
      )}

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

// ── Memory Detail Modal ──────────────────────────────────────

function MemoryDetailModal({ entry }: { entry: InsightsMemoryEntry }) {
  const pct = Math.round(entry.importance * 100);
  const accent = TYPE_ACCENT[entry.memoryType] || { text: "text-muted-foreground", bg: "bg-muted-foreground", border: "border-border" };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="w-full text-left">
          <MemoryCardInner entry={entry} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4" />
            Memory Detail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">{entry.content}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</p>
              <p className={cn("text-xs font-medium", accent.text)}>
                {TYPE_LABELS[entry.memoryType] || entry.memoryType}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Scope</p>
              <p className="text-xs font-medium">
                {SCOPE_LABELS[entry.scope] || entry.scope}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Relevance</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full", accent.bg)} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-mono font-medium">{pct}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tier</p>
              <p className="text-xs font-medium">
                {TIER_LABELS[entry.tier] || entry.tier}
              </p>
            </div>
            {entry.category && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                <p className="text-xs font-medium">{entry.category}</p>
              </div>
            )}
          </div>

          <p className="text-[10px] font-mono text-muted-foreground/50 truncate">{entry.id}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Memory Entry Card ──────────────────────────────────────

function MemoryCardInner({ entry }: { entry: InsightsMemoryEntry }) {
  const pct = Math.round(entry.importance * 100);
  const accent = TYPE_ACCENT[entry.memoryType] || { text: "text-muted-foreground", bg: "bg-muted-foreground", border: "border-border" };

  return (
    <div className={cn(
      "group relative rounded-md border bg-card/50 hover:bg-card transition-colors cursor-pointer",
      accent.border,
    )}>
      <div className={cn("absolute left-0 top-2 bottom-2 w-0.5 rounded-full", accent.bg)} />

      <div className="pl-3.5 pr-3 py-2.5 space-y-1.5">
        <p className="text-[11px] leading-relaxed text-foreground/90 line-clamp-2">{entry.content}</p>

        <div className="flex items-center gap-1.5 text-[9px]">
          <span className={cn("font-medium uppercase tracking-wide", accent.text)}>
            {TYPE_LABELS[entry.memoryType] || entry.memoryType}
          </span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span className="text-muted-foreground/60">
            {SCOPE_LABELS[entry.scope] || entry.scope}
          </span>
          {entry.category && (
            <>
              <span className="text-muted-foreground/40">&middot;</span>
              <span className="text-muted-foreground/60">{entry.category}</span>
            </>
          )}
          <span className="ml-auto font-mono tabular-nums text-muted-foreground/50">{pct}%</span>
        </div>
      </div>
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
  entries,
  contextData,
  knowledgeData,
  modelContextWindow,
  isStreaming,
  onConsolidate,
}: MemoryTabProps) {
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateResult, setConsolidateResult] = useState<string | null>(null);

  const handleConsolidate = async () => {
    if (!onConsolidate) return;
    setConsolidating(true);
    setConsolidateResult(null);
    try {
      const data = await onConsolidate();
      setConsolidateResult(`Decayed: ${data.decayed}, Invalidated: ${data.invalidated} (${data.duration_ms}ms)`);
    } catch {
      setConsolidateResult("Consolidation failed");
    }
    setConsolidating(false);
    setTimeout(() => setConsolidateResult(null), 4000);
  };

  const bo = contextData?.budgetOverview;
  const history = contextData?.history;
  const budget = history?.budget;
  const messages = history?.messages ?? [];
  const historyTokens = budget ? Math.round(budget.totalChars / 4) : 0;
  const memEntries = contextData?.memoryEntries ?? entries;

  const cw = modelContextWindow ?? 0;
  const allocated = {
    history: Math.round(cw * 30 / 100),
    memory: Math.round(cw * 10 / 100),
    rag: Math.round(cw * 15 / 100),
  };

  const memoryTokensUsed = bo?.layers.memory?.used ?? Math.round(memEntries.reduce((sum, e) => sum + e.content.length, 0) / 4);
  const ragTokensUsed = bo?.layers.rag?.used ?? Math.round((knowledgeData?.chunks ?? []).reduce((sum, c) => sum + (c.contentPreview?.length ?? 0), 0) / 4);
  const currentUsed = {
    history: bo?.layers.history?.used ?? historyTokens,
    memory: memoryTokensUsed,
    rag: ragTokensUsed,
  };

  const lastUsedRef = useRef({ history: 0, memory: 0, rag: 0 });
  if (currentUsed.history > 0 || currentUsed.memory > 0 || currentUsed.rag > 0) {
    lastUsedRef.current = currentUsed;
  }
  const used = isStreaming && currentUsed.history === 0 && currentUsed.memory === 0 && currentUsed.rag === 0
    ? lastUsedRef.current
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
          {onConsolidate && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[10px] gap-1.5"
              onClick={handleConsolidate}
              disabled={consolidating || !contextData}
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
        icon={Brain}
        title="Recalled Memories"
        trailing={
          cw > 0 ? (
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
              {formatK(used.memory)} / {formatK(allocated.memory)} tok
            </span>
          ) : undefined
        }
      />
      <div className="px-4 pb-3">
        {memEntries.length > 0 ? (
          <div className="space-y-1.5">
            {memEntries.map((entry) => (
              <MemoryDetailModal key={entry.id} entry={entry} />
            ))}
          </div>
        ) : isStreaming ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Retrieving relevant memories…
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">No memories recalled for this message.</p>
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
