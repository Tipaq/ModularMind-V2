"use client";

import { useState } from "react";
import {
  Clock,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge, Button, cn } from "@modularmind/ui";
import type { MemoryEntry, ContextData, BudgetOverview } from "@/hooks/useChat";

// ── Types ────────────────────────────────────────────────────

export interface MemoryTabProps {
  entries: MemoryEntry[];
  contextData: ContextData | null;
  modelContextWindow?: number | null;
}

// ── Constants ────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  cross_conversation: "Cross-conv",
  user_profile: "Profile",
  agent: "Agent",
  conversation: "Conversation",
};

const TYPE_LABELS: Record<string, string> = {
  episodic: "Episodic",
  semantic: "Semantic",
  procedural: "Procedural",
};

const LAYER_COLORS: Record<string, { bg: string; text: string }> = {
  history: { bg: "bg-info", text: "text-info" },
  memory: { bg: "bg-warning", text: "text-warning" },
  rag: { bg: "bg-success", text: "text-success" },
};

// ── Shared: Collapsible Section ──────────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex-1">
          {title}
        </span>
        {badge && (
          <Badge variant="secondary" className="text-[10px] h-4">
            {badge}
          </Badge>
        )}
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ── Memory Entry Card ────────────────────────────────────────

function MemoryEntryCard({ entry }: { entry: MemoryEntry }) {
  const pct = Math.round(entry.importance * 100);
  return (
    <div className="border border-border/50 rounded-lg p-2.5 space-y-1.5">
      <p className="text-xs leading-relaxed">{entry.content}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all bg-info"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-info">{pct}%</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {entry.memoryType && (
          <Badge variant="outline" className="text-[10px] h-4">
            {TYPE_LABELS[entry.memoryType] || entry.memoryType}
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px] h-4">
          {SCOPE_LABELS[entry.scope] || entry.scope}
        </Badge>
        {entry.category && (
          <Badge variant="secondary" className="text-[10px] h-4">
            {entry.category}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── Context Usage Bar ────────────────────────────────────────

function ContextUsageBar({ overview }: { overview: BudgetOverview }) {
  const formatK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
  const cw = overview.contextWindow;
  const totalUsed = overview.layers.history.used + overview.layers.memory.used + overview.layers.rag.used;
  const totalPct = cw > 0 ? Math.round((totalUsed / cw) * 100) : 0;

  return (
    <div className="px-4 py-3 space-y-2.5 border-b border-border/50">
      {/* Header: context window size + total usage */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Context Window
        </p>
        <span className="text-[11px] font-mono font-medium tabular-nums">
          {formatK(cw)} tok
        </span>
      </div>

      {/* Stacked usage bar — relative to full context window */}
      <div className="relative">
        <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
          {(["history", "memory", "rag"] as const).map((key) => {
            const widthPct = cw > 0 ? (overview.layers[key].used / cw) * 100 : 0;
            return widthPct > 0 ? (
              <div
                key={key}
                className={cn("h-full transition-all", LAYER_COLORS[key].bg)}
                style={{ width: `${widthPct}%` }}
              />
            ) : null;
          })}
        </div>
        {/* Cap marker when maxPct < 100 */}
        {overview.maxPct < 100 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-foreground/40"
            style={{ left: `${overview.maxPct}%` }}
            title={`Cap: ${overview.maxPct}%`}
          />
        )}
      </div>

      {/* Total summary line */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          <span className="font-mono font-medium text-foreground">{formatK(totalUsed)}</span>
          <span> / {formatK(cw)} used</span>
        </span>
        <span className={cn(
          "font-mono font-medium",
          totalPct >= 90 ? "text-destructive" : totalPct >= 70 ? "text-warning" : "text-foreground",
        )}>
          {totalPct}%
        </span>
      </div>

      {/* Per-layer breakdown — percentages relative to full context window */}
      <div className="grid grid-cols-3 gap-1">
        {(["history", "memory", "rag"] as const).map((key) => {
          const layer = overview.layers[key];
          const usedPct = cw > 0 ? Math.round((layer.used / cw) * 100) : 0;
          const allocPct = cw > 0 ? Math.round((layer.allocated / cw) * 100) : 0;
          return (
            <div key={key} className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", LAYER_COLORS[key].bg)} />
                <span className="text-[10px] text-muted-foreground capitalize">{key}</span>
              </div>
              <p className={cn("text-[11px] font-mono tabular-nums", LAYER_COLORS[key].text)}>
                {formatK(layer.used)}
              </p>
              <p className="text-[9px] font-mono text-muted-foreground tabular-nums">
                {usedPct}% / {allocPct}%
              </p>
            </div>
          );
        })}
      </div>

      {/* Cap info */}
      {overview.maxPct < 100 && (
        <p className="text-[9px] text-muted-foreground/60 text-center">
          Capped at {overview.maxPct}% &middot; {formatK(overview.effectiveContext)} effective
        </p>
      )}
    </div>
  );
}

// ── Memory Tab Content ───────────────────────────────────────

export function MemoryTab({
  entries,
  contextData,
  modelContextWindow,
}: MemoryTabProps) {
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateResult, setConsolidateResult] = useState<string | null>(null);

  const handleConsolidate = async () => {
    setConsolidating(true);
    setConsolidateResult(null);
    try {
      const res = await fetch("/api/chat/memory/consolidate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setConsolidateResult(`Decayed: ${data.decayed}, Invalidated: ${data.invalidated} (${data.duration_ms}ms)`);
      } else {
        setConsolidateResult("Consolidation failed");
      }
    } catch {
      setConsolidateResult("Consolidation failed");
    }
    setConsolidating(false);
    setTimeout(() => setConsolidateResult(null), 4000);
  };

  const history = contextData?.history;
  const budget = history?.budget;
  const memEntries = contextData?.memoryEntries ?? entries;
  const budgetOverview = contextData?.budgetOverview ?? null;

  const formatK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);

  return (
    <div className="space-y-1">
      {/* Context Usage Bar — or fallback showing model context window */}
      {budgetOverview ? (
        <ContextUsageBar overview={budgetOverview} />
      ) : modelContextWindow ? (
        <div className="px-4 py-3 space-y-2 border-b border-border/50">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Context Window
            </p>
            <span className="text-[11px] font-mono font-medium tabular-nums">
              {formatK(modelContextWindow)} tok
            </span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-muted" />
          <p className="text-[10px] text-muted-foreground">
            Send a message to see context usage breakdown.
          </p>
        </div>
      ) : null}

      {/* Section 1: Context Window (Buffer) */}
      <CollapsibleSection
        title="Context Window"
        icon={Clock}
        badge={budget ? `${budget.includedCount} msgs` : undefined}
        defaultOpen
      >
        {budget ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="font-mono">
                {budget.includedCount} messages
              </span>
              {budget.historyBudgetTokens != null && budget.historyBudgetTokens > 0 ? (
                <>
                  <span className="text-muted-foreground">&middot;</span>
                  <span className="font-mono">
                    {Math.round(budget.totalChars / 4).toLocaleString()}/{budget.historyBudgetTokens.toLocaleString()} tok
                  </span>
                  {budget.historyBudgetPct != null && budget.contextWindow != null && (
                    <>
                      <span className="text-muted-foreground">&middot;</span>
                      <span className="text-muted-foreground">
                        {budget.historyBudgetPct}% of {budget.contextWindow >= 1000 ? `${(budget.contextWindow / 1000).toFixed(budget.contextWindow >= 10000 ? 0 : 1)}K` : budget.contextWindow}
                      </span>
                    </>
                  )}
                </>
              ) : budget.maxChars > 0 ? (
                <>
                  <span className="text-muted-foreground">&middot;</span>
                  <span className="font-mono">
                    {budget.totalChars.toLocaleString()}/{budget.maxChars.toLocaleString()} chars
                  </span>
                </>
              ) : null}
              {budget.budgetExceeded && (
                <Badge variant="outline" className="text-[10px] h-4 text-warning border-warning/30">
                  budget exceeded
                </Badge>
              )}
            </div>
            {(budget.historyBudgetTokens ?? budget.maxChars) > 0 && (
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    budget.budgetExceeded ? "bg-warning" : "bg-primary",
                  )}
                  style={{ width: `${Math.min(100, (budget.totalChars / Math.max(1, budget.maxChars)) * 100)}%` }}
                />
              </div>
            )}
            {history && history.messages.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {history.messages.map((msg, i) => (
                  <div key={i} className="text-[11px] flex gap-2 items-start">
                    <Badge variant="secondary" className="text-[10px] h-4 shrink-0 mt-0.5">
                      {msg.role}
                    </Badge>
                    <span className="text-muted-foreground line-clamp-2">{msg.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No buffer data available.</p>
        )}
      </CollapsibleSection>

      {/* Section 2: Summary (Compacting) */}
      <CollapsibleSection
        title="Summary"
        icon={FileText}
        badge={history?.summary ? "active" : undefined}
        defaultOpen={!!history?.summary}
      >
        {history?.summary ? (
          <div className="border border-border/50 rounded-lg p-2.5 bg-success/5">
            <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {history.summary}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {budget?.budgetExceeded
              ? "Budget exceeded but no conversation summary exists yet."
              : "No summary needed \u2014 all messages fit in context."}
          </p>
        )}
      </CollapsibleSection>

      {/* Section 3: Vector Memories */}
      <CollapsibleSection
        title="Vector Memories"
        icon={Database}
        badge={memEntries.length > 0 ? `${memEntries.length}` : undefined}
        defaultOpen={memEntries.length > 0}
      >
        {memEntries.length > 0 ? (
          <div className="space-y-2">
            {memEntries.map((entry) => (
              <MemoryEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No vector memories retrieved for this message.</p>
        )}
      </CollapsibleSection>

      {/* Consolidate / Compact button */}
      <div className="px-4 py-3 border-t border-border/50">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs gap-1.5"
          onClick={handleConsolidate}
          disabled={consolidating}
        >
          {consolidating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {consolidating ? "Consolidating..." : "Compact Memory"}
        </Button>
        {consolidateResult && (
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">{consolidateResult}</p>
        )}
      </div>
    </div>
  );
}
