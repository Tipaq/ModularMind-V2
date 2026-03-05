"use client";

import { useState, useMemo } from "react";
import {
  Bot,
  BookOpen,
  Brain,
  Clock,
  Database,
  FileText,
  Wrench,
  ChevronDown,
  ChevronRight,
  Activity,
  FileJson,
  Pencil,
  Loader2,
  Settings2,
  Zap,
  RefreshCw,
} from "lucide-react";
import {
  Badge,
  Button,
  cn,
  Switch,
  TabsContent,
  ChatPanel,
} from "@modularmind/ui";
import type { ChatPanelTab } from "@modularmind/ui";
import type { ExecutionActivity, MemoryEntry, KnowledgeData, KnowledgeChunk, MessageExecutionData, ContextData, BudgetOverview } from "@/hooks/useChat";
import type { EngineModel, SupervisorLayer } from "@/hooks/useChatConfig";
import { ExecutionActivityList } from "@modularmind/ui";
import { ToolCallCard } from "./ToolCallCard";

interface ChatConfig {
  supervisorMode: boolean;
  supervisorPrompt: string;
  modelId: string | null;
  modelOverride: boolean;
}

interface InsightsPanelProps {
  selectedExecution: MessageExecutionData | null;
  liveActivities: ExecutionActivity[];
  isStreaming: boolean;
  isLiveSelected: boolean;
  config: ChatConfig;
  onConfigChange: (patch: Partial<ChatConfig>) => void;
  models: EngineModel[];
  supervisorLayers: SupervisorLayer[];
  onUpdateLayer: (key: string, content: string) => Promise<boolean>;
  selectedModelContextWindow?: number | null;
}

// ── Execution Metrics ────────────────────────────────────────

interface ExecutionMetrics {
  totalDurationMs: number | null;
  llmDurationMs: number | null;
  tokensPerSecond: number | null;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  modelUsed: string | null;
  llmCalls: number;
  toolCalls: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

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

// ── Empty State ──────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Icon className="h-5 w-5 mb-2 opacity-30" />
      <p className="text-xs text-center px-4">{message}</p>
    </div>
  );
}

// ── Config Tab Content (merged Model + Supervisor) ──────────

function ConfigTabContent({
  models,
  selectedModelId,
  modelOverride,
  onToggleOverride,
  supervisorMode,
  onToggleSupervisor,
  layers,
  onUpdateLayer,
  metrics,
}: {
  models: EngineModel[];
  selectedModelId: string | null;
  modelOverride: boolean;
  onToggleOverride: (enabled: boolean) => void;
  supervisorMode: boolean;
  onToggleSupervisor: (enabled: boolean) => void;
  layers: SupervisorLayer[];
  onUpdateLayer: (key: string, content: string) => Promise<boolean>;
  metrics: ExecutionMetrics | null;
}) {
  const selectedModel = useMemo(() => {
    if (!selectedModelId) return null;
    const available = models.filter((m) => m.is_active && m.is_available && !m.is_embedding);
    return available.find((m) => m.id === selectedModelId || `${m.provider}:${m.model_id}` === selectedModelId) ?? null;
  }, [models, selectedModelId]);

  return (
    <div className="space-y-1">
      {/* Model info */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        {selectedModel ? (
          <div className="border border-border/50 rounded-lg p-2.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">Model</span>
              <span className="text-right font-medium">{selectedModel.display_name || selectedModel.name}</span>
              <span className="text-muted-foreground">Provider</span>
              <span className="text-right font-medium">{selectedModel.provider}</span>
              <span className="text-muted-foreground">Model ID</span>
              <span className="text-right font-mono text-[11px] truncate">{selectedModel.model_id}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No model selected. Use the model picker in the input bar.
          </p>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Override agent models</p>
            {modelOverride && (
              <p className="text-xs text-warning mt-0.5">
                All agents and graphs will use this model instead of their configured model.
              </p>
            )}
          </div>
          <Switch checked={modelOverride} onCheckedChange={onToggleOverride} />
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-border/50" />

      {/* Supervisor */}
      <div className="px-4 pt-3 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">Supervisor Mode</span>
          <Switch checked={supervisorMode} onCheckedChange={onToggleSupervisor} />
        </div>
        {supervisorMode && layers.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Soul Layers
            </p>
            {layers.map((layer) => (
              <LayerEditor
                key={layer.key}
                layer={layer}
                onSave={onUpdateLayer}
              />
            ))}
          </div>
        )}
      </div>

      {/* Execution Metrics */}
      {metrics && (metrics.totalDurationMs != null || metrics.tokenUsage) && (
        <>
          <div className="border-t border-border/50" />
          <div className="px-4 pt-3 pb-4 space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Last Execution
            </p>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {metrics.totalDurationMs != null && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />Total time
                  </span>
                  <span className="font-mono text-right">{formatDuration(metrics.totalDurationMs)}</span>
                </>
              )}
              {metrics.llmDurationMs != null && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Zap className="h-3 w-3" />LLM time
                  </span>
                  <span className="font-mono text-right">
                    {formatDuration(metrics.llmDurationMs)}
                    {metrics.llmCalls > 1 && (
                      <span className="text-muted-foreground ml-1">({metrics.llmCalls} calls)</span>
                    )}
                  </span>
                </>
              )}
              {metrics.toolCalls > 0 && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Wrench className="h-3 w-3" />Tools
                  </span>
                  <span className="font-mono text-right">{metrics.toolCalls} call{metrics.toolCalls > 1 ? "s" : ""}</span>
                </>
              )}
            </div>

            {/* Token usage card */}
            {metrics.tokenUsage && (
              <div className="border border-border/50 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono">{formatNumber(metrics.tokenUsage.prompt)}</span>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span className="font-mono">{formatNumber(metrics.tokenUsage.completion)}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="font-mono font-medium">{formatNumber(metrics.tokenUsage.total)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>prompt</span>
                  <span />
                  <span>completion</span>
                  <span />
                  <span>total</span>
                </div>
                {metrics.tokensPerSecond != null && (
                  <div className="text-center text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                    <span className="font-mono font-medium text-foreground">{Math.round(metrics.tokensPerSecond)}</span> tok/s
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LayerEditor({
  layer,
  onSave,
}: {
  layer: SupervisorLayer;
  onSave: (key: string, content: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(layer.content);
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setDraft(layer.content);
    setEditing(true);
    setExpanded(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(layer.key, draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
        <span className="text-xs font-medium flex-1">{layer.label}</span>
        {!editing && (
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={handleEdit}>
            <Pencil className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>
      {!editing && layer.content && (
        <div
          className="relative cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <pre
            className={cn(
              "text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words px-3 py-2 leading-relaxed",
              !expanded && "line-clamp-6",
            )}
          >
            {layer.content}
          </pre>
          {!expanded && (
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card/80 to-transparent pointer-events-none" />
          )}
        </div>
      )}
      {editing && (
        <div className="px-3 pb-2 pt-1 space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[80px] max-h-[200px] text-xs font-mono bg-muted/50 border border-border rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Activity Tab Content ─────────────────────────────────────

function ActivityTabContent({
  activities,
  isStreaming,
  tokenUsage,
  activeAgent,
  toolCalls,
  steps,
}: {
  activities: ExecutionActivity[];
  isStreaming: boolean;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  activeAgent: { name: string; isEphemeral?: boolean; status: string } | null;
  toolCalls: ExecutionActivity[];
  steps: ExecutionActivity[];
}) {
  if (!activities.length && !tokenUsage) {
    return <EmptyState icon={Activity} message="Send a message to see execution activity." />;
  }

  return (
    <div className="p-4 space-y-3">
      {/* Token Usage */}
      {tokenUsage && (
        <div className="border border-border/50 rounded-lg p-2.5">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Tokens:</span>
            <span className="font-mono">{tokenUsage.prompt}</span>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="font-mono">{tokenUsage.completion}</span>
            <span className="text-muted-foreground">=</span>
            <span className="font-mono font-medium">{tokenUsage.total}</span>
          </div>
        </div>
      )}

      {/* Active Agent */}
      {activeAgent && (
        <div className="border border-border/50 rounded-lg p-2.5">
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium flex-1">{activeAgent.name}</span>
            {activeAgent.isEphemeral && (
              <Badge variant="outline" className="text-[10px]">ephemeral</Badge>
            )}
            <Badge
              variant={activeAgent.status === "running" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {activeAgent.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Activity Stream */}
      {activities.length > 0 && (
        <ExecutionActivityList
          activities={activities}
          isStreaming={isStreaming}
          flat
        />
      )}

      {/* Tool Calls */}
      {toolCalls.length > 0 && (
        <CollapsibleSection title="Tool Calls" icon={Wrench} defaultOpen={true} badge={`${toolCalls.length}`}>
          <div className="space-y-2">
            {toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                toolData={tc.toolData!}
                status={tc.status}
                durationMs={tc.durationMs}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <CollapsibleSection title="Steps" icon={FileJson} badge={`${steps.length}`}>
          <div className="space-y-2">
            {steps.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ── Memory Tab Content ───────────────────────────────────────

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

const LAYER_COLORS: Record<string, { bg: string; text: string }> = {
  history: { bg: "bg-info", text: "text-info" },
  memory: { bg: "bg-warning", text: "text-warning" },
  rag: { bg: "bg-success", text: "text-success" },
};

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

function MemoryTabContent({
  entries,
  contextData,
  modelContextWindow,
}: {
  entries: MemoryEntry[];
  contextData: ContextData | null;
  modelContextWindow?: number | null;
}) {
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

// ── Knowledge Tab Content ────────────────────────────────────

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

function KnowledgeTabContent({ data }: { data: KnowledgeData | null }) {
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

// ── Step Card ────────────────────────────────────────────────

function StepCard({ step }: { step: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        <Badge
          variant={step.status === "running" ? "default" : step.status === "failed" ? "destructive" : "secondary"}
          className="text-[10px]"
        >
          {step.status}
        </Badge>
        <span className="text-xs font-medium truncate flex-1">{step.label}</span>
        {step.durationMs != null && (
          <span className="text-[10px] text-muted-foreground">
            {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {expanded && step.preview && (
        <div className="border-t border-border/50 px-3 py-2">
          <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
            {step.preview}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Tab Definitions ──────────────────────────────────────────

const PANEL_TABS: ChatPanelTab[] = [
  { value: "config", label: "Config", icon: Settings2 },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "memory", label: "Memory", icon: Brain },
  { value: "knowledge", label: "RAG", icon: BookOpen },
];

// ── Main Panel ───────────────────────────────────────────────

export function InsightsPanel({
  selectedExecution,
  liveActivities,
  isStreaming,
  isLiveSelected,
  config,
  onConfigChange,
  models,
  supervisorLayers,
  onUpdateLayer,
  selectedModelContextWindow,
}: InsightsPanelProps) {
  const displayActivities = useMemo(() => {
    return isLiveSelected && isStreaming
      ? liveActivities
      : selectedExecution?.activities ?? [];
  }, [isLiveSelected, isStreaming, liveActivities, selectedExecution?.activities]);

  const memoryEntries = selectedExecution?.memoryEntries ?? [];
  const contextData = selectedExecution?.contextData ?? null;
  const knowledgeData = selectedExecution?.knowledgeData ?? null;
  const tokenUsage = selectedExecution?.tokenUsage ?? null;

  const toolCalls = useMemo(
    () => displayActivities.filter((a) => a.type === "tool" && a.toolData),
    [displayActivities],
  );

  const activeAgent = useMemo(() => {
    const delegation = [...displayActivities].reverse().find((a) => a.type === "delegation");
    if (!delegation) return null;
    return {
      name: delegation.agentName || delegation.label.replace("Delegating to ", ""),
      isEphemeral: delegation.isEphemeral,
      status: delegation.status,
    };
  }, [displayActivities]);

  const steps = useMemo(
    () => displayActivities.filter((a) => a.type === "step"),
    [displayActivities],
  );

  const executionMetrics = useMemo<ExecutionMetrics | null>(() => {
    // Show metrics as soon as we have any activities (routing, delegation, etc.) or token data
    if (!displayActivities.length && !tokenUsage) return null;

    const llmActivities = displayActivities.filter((a) => a.type === "llm");
    const toolActivities = displayActivities.filter((a) => a.type === "tool");

    // Total duration: use delegation end duration (most accurate) or compute from activity span
    let totalDurationMs: number | null = null;
    const delegationEnd = displayActivities.find((a) => a.type === "delegation" && a.status !== "running" && a.durationMs);
    const directResponse = displayActivities.find((a) => a.type === "direct_response" && a.durationMs);
    if (delegationEnd?.durationMs) {
      totalDurationMs = delegationEnd.durationMs;
    } else if (directResponse?.durationMs) {
      totalDurationMs = directResponse.durationMs;
    } else {
      const withDuration = displayActivities.filter((a) => a.startedAt && a.durationMs != null);
      if (withDuration.length > 0) {
        const earliest = Math.min(...displayActivities.filter((a) => a.startedAt).map((a) => a.startedAt));
        const latest = Math.max(...withDuration.map((a) => a.startedAt + (a.durationMs || 0)));
        if (latest > earliest) totalDurationMs = latest - earliest;
      }
    }

    // LLM duration: sum of all LLM call durations
    const llmDurationMs = llmActivities.reduce((sum, a) => sum + (a.durationMs || 0), 0) || null;

    // Tokens per second
    let tokensPerSecond: number | null = null;
    if (tokenUsage && llmDurationMs && llmDurationMs > 0) {
      tokensPerSecond = (tokenUsage.completion / (llmDurationMs / 1000));
    }

    // Model used: from LLM activity trace, or fall back to configured model
    const modelUsed = [...llmActivities].reverse().find((a) => a.model)?.model ?? config.modelId;

    return {
      totalDurationMs,
      llmDurationMs,
      tokensPerSecond,
      tokenUsage,
      modelUsed,
      llmCalls: llmActivities.length,
      toolCalls: toolActivities.length,
    };
  }, [displayActivities, tokenUsage, config.modelId]);

  return (
    <ChatPanel tabs={PANEL_TABS} defaultTab="config">
      <TabsContent value="config" className="mt-0">
        <ConfigTabContent
          models={models}
          selectedModelId={config.modelId}
          modelOverride={config.modelOverride}
          onToggleOverride={(enabled) => onConfigChange({ modelOverride: enabled })}
          supervisorMode={config.supervisorMode}
          onToggleSupervisor={(enabled) => onConfigChange({ supervisorMode: enabled })}
          layers={supervisorLayers}
          onUpdateLayer={onUpdateLayer}
          metrics={executionMetrics}
        />
      </TabsContent>

      <TabsContent value="activity" className="mt-0">
        <ActivityTabContent
          activities={displayActivities}
          isStreaming={isLiveSelected && isStreaming}
          tokenUsage={tokenUsage}
          activeAgent={activeAgent}
          toolCalls={toolCalls}
          steps={steps}
        />
      </TabsContent>

      <TabsContent value="memory" className="mt-0">
        <MemoryTabContent
          entries={memoryEntries}
          contextData={contextData}
          modelContextWindow={selectedModelContextWindow}
        />
      </TabsContent>

      <TabsContent value="knowledge" className="mt-0">
        <KnowledgeTabContent data={knowledgeData} />
      </TabsContent>
    </ChatPanel>
  );
}
