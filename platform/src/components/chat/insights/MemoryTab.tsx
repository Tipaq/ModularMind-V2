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
import type { MemoryEntry, ContextData } from "@/hooks/useChat";

// ── Types ────────────────────────────────────────────────────

export interface MemoryTabProps {
  entries: MemoryEntry[];
  contextData: ContextData | null;
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

// ── Helpers ──────────────────────────────────────────────────

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ── Memory Usage Header ─────────────────────────────────────

function MemoryUsageHeader({ contextData }: { contextData: ContextData }) {
  const bo = contextData.budgetOverview;
  if (!bo) return null;

  const memLayer = bo.layers.memory;
  const cw = bo.contextWindow;
  const usedPct = cw > 0 ? Math.round((memLayer.used / cw) * 100) : 0;
  const allocPct = cw > 0 ? Math.round((memLayer.allocated / cw) * 100) : 0;

  return (
    <div className="px-4 py-3 space-y-2 border-b border-border/50">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Memory Context
        </p>
        <span className="text-[11px] font-mono font-medium tabular-nums text-warning">
          {formatK(memLayer.used)} tok
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all bg-warning"
          style={{ width: `${Math.max(usedPct, 1)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {usedPct}% of context used
        </span>
        <span className="font-mono">
          {formatK(memLayer.allocated)} allocated ({allocPct}%)
        </span>
      </div>
    </div>
  );
}

// ── Memory Tab Content ───────────────────────────────────────

export function MemoryTab({
  entries,
  contextData,
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

  return (
    <div className="space-y-1">
      {/* Memory-specific context usage */}
      {contextData && <MemoryUsageHeader contextData={contextData} />}

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
