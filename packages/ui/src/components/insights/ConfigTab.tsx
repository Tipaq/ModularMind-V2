"use client";

import { useState, useMemo, useRef } from "react";
import {
  AlertTriangle,
  Bot,
  Clock,
  Cpu,
  Gauge,
  Loader2,
  Pencil,
  Route,
  User,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "../badge";
import { Button } from "../button";
import { Switch } from "../switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";
import { cn } from "../../lib/utils";
import type { BudgetOverview } from "../../types/chat";
import type { EngineAgent, EngineGraph, EngineModel, SupervisorLayer } from "../../types/engine";

// ── Types ────────────────────────────────────────────────────

export interface ExecutionMetrics {
  totalDurationMs: number | null;
  llmDurationMs: number | null;
  tokensPerSecond: number | null;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  modelUsed: string | null;
  llmCalls: number;
  toolCalls: number;
}

export interface ConfigTabProps {
  models: EngineModel[];
  selectedModelId: string | null;
  modelOverride: boolean;
  onToggleOverride: (enabled: boolean) => void;
  supervisorMode: boolean;
  onToggleSupervisor: (enabled: boolean) => void;
  layers: SupervisorLayer[];
  onUpdateLayer: (key: string, content: string) => Promise<boolean>;
  metrics: ExecutionMetrics | null;
  budgetOverview: BudgetOverview | null;
  modelContextWindow?: number | null;
  enabledAgents: EngineAgent[];
  enabledGraphs: EngineGraph[];
  allAgents: EngineAgent[];
  allGraphs: EngineGraph[];
  userPreferences?: string | null;
  onSavePreferences?: (prefs: string) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ── Shared Section Card ─────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  trailing,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3.5 space-y-2.5", className)}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </p>
        {trailing}
      </div>
      {children}
    </div>
  );
}

// ── Context Usage ───────────────────────────────────────────

const LAYER_KEYS = ["system", "history", "memory", "rag"] as const;

const LAYER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  system: { bg: "bg-primary", text: "text-primary", label: "System" },
  history: { bg: "bg-info", text: "text-info", label: "History" },
  memory: { bg: "bg-warning", text: "text-warning", label: "Memory" },
  rag: { bg: "bg-success", text: "text-success", label: "RAG" },
};

function getLayer(overview: BudgetOverview, key: string) {
  if (key === "system") return overview.layers.system ?? null;
  return overview.layers[key as "history" | "memory" | "rag"];
}

function ContextUsage({ overview }: { overview: BudgetOverview }) {
  const cw = overview.contextWindow;
  const systemUsed = overview.layers.system?.used ?? 0;
  const totalUsed = systemUsed + overview.layers.history.used + overview.layers.memory.used + overview.layers.rag.used;
  const totalPct = cw > 0 ? Math.round((totalUsed / cw) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Gauge className="h-3 w-3" />
          Context window
        </span>
        <span className="font-mono font-medium text-foreground">{formatK(cw)} tok</span>
      </div>
      <div className="relative">
        <div className="flex h-2 rounded-full overflow-hidden bg-muted">
          {LAYER_KEYS.map((key) => {
            const layer = getLayer(overview, key);
            if (!layer) return null;
            const widthPct = cw > 0 ? (layer.used / cw) * 100 : 0;
            return widthPct > 0 ? (
              <div
                key={key}
                className={cn("h-full transition-all", LAYER_COLORS[key].bg)}
                style={{ width: `${widthPct}%` }}
              />
            ) : null;
          })}
        </div>
        {overview.maxPct < 100 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-foreground/40"
            style={{ left: `${overview.maxPct}%` }}
            title={`Cap: ${overview.maxPct}%`}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{formatK(totalUsed)}</span>
          {" / "}{formatK(cw)}
        </span>
        <span className={cn(
          "font-mono font-medium",
          totalPct >= 90 ? "text-destructive" : totalPct >= 70 ? "text-warning" : "text-foreground",
        )}>
          {totalPct}%
        </span>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-2 flex-wrap">
          {LAYER_KEYS.map((key) => {
            const layer = getLayer(overview, key);
            if (!layer || layer.used <= 0) return null;
            const pct = cw > 0 ? Math.round((layer.used / cw) * 100) : 0;
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-default">
                    <span className={cn("h-1.5 w-1.5 rounded-full", LAYER_COLORS[key].bg)} />
                    <span className={cn("text-[10px] font-mono tabular-nums", LAYER_COLORS[key].text)}>
                      {formatK(layer.used)}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{pct}%</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">{LAYER_COLORS[key].label}</p>
                  <p className="text-muted-foreground">
                    {formatK(layer.used)} / {formatK(layer.allocated)} tokens ({layer.pct}% budget)
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {overview.maxPct < 100 && (
        <p className="text-[9px] text-muted-foreground/60 text-center">
          Capped at {overview.maxPct}% &middot; {formatK(overview.effectiveContext)} effective
        </p>
      )}
    </div>
  );
}

// ── Layer Editor ─────────────────────────────────────────────

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

  const charCount = layer.content?.length ?? 0;

  return (
    <div className="rounded-lg overflow-hidden bg-muted/15 border border-border/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[11px] font-medium flex-1 truncate">{layer.label}</span>
        {charCount > 0 && !editing && (
          <span className="text-[10px] font-mono text-muted-foreground/60">{charCount > 999 ? `${(charCount / 1000).toFixed(1)}K` : charCount} chars</span>
        )}
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 shrink-0"
            onClick={handleEdit}
          >
            <Pencil className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>

      {!editing && layer.content && (
        <div
          className="border-t border-border/30 relative cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <pre className={cn(
            "text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words px-3 py-2 leading-relaxed",
            expanded ? "max-h-[400px] overflow-y-auto" : "line-clamp-12",
          )}>
            {layer.content}
          </pre>
          {!expanded && (
            <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-muted/30 to-transparent pointer-events-none" />
          )}
        </div>
      )}

      {editing && (
        <div className="border-t border-border/30 px-3 pb-2.5 pt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[100px] max-h-[240px] text-[11px] font-mono bg-background border border-border/60 rounded-md p-2.5 resize-y leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground/50">{draft.length} chars</span>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" className="h-6 px-2.5 text-[11px]" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" className="h-6 px-2.5 text-[11px]" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── User Profile Section ─────────────────────────────────────

function UserProfileSection({
  preferences,
  onSave,
}: {
  preferences: string;
  onSave: (prefs: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleBlur = async () => {
    if (draft === preferences) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const charCount = draft.length;
  const overLimit = charCount > 2000;

  return (
    <SectionCard icon={User} title="User Profile" trailing={
      saving ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null
    }>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        placeholder="Tell the assistant about yourself — preferences, context, instructions that should persist across conversations..."
        className="w-full min-h-[80px] max-h-[200px] text-[11px] font-mono bg-background border border-border/60 rounded-md p-2.5 resize-y leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
        maxLength={2000}
      />
      <div className="flex items-center justify-between">
        <span className={cn(
          "text-[10px] font-mono",
          overLimit ? "text-destructive" : "text-muted-foreground/50",
        )}>
          {charCount} / 2000
        </span>
        <span className="text-[10px] text-muted-foreground/40">Saves on blur</span>
      </div>
    </SectionCard>
  );
}

// ── Config Tab Content ───────────────────────────────────────

export function ConfigTab({
  models,
  selectedModelId,
  modelOverride,
  onToggleOverride,
  supervisorMode,
  onToggleSupervisor,
  layers,
  onUpdateLayer,
  metrics,
  budgetOverview,
  modelContextWindow,
  enabledAgents,
  enabledGraphs,
  allAgents,
  userPreferences,
  onSavePreferences,
}: ConfigTabProps) {
  const selectedModel = useMemo(() => {
    if (!selectedModelId) return null;
    const available = models.filter((m) => m.is_active && m.is_available && !m.is_embedding);
    return available.find((m) => m.id === selectedModelId || `${m.provider}:${m.model_id}` === selectedModelId) ?? null;
  }, [models, selectedModelId]);

  const effectiveOverview = useMemo<BudgetOverview | null>(() => {
    if (budgetOverview) return budgetOverview;
    const cw = modelContextWindow;
    if (!cw || cw <= 0) return null;

    const systemPct = 10;
    const historyPct = 30;
    const memoryPct = 10;
    const ragPct = 15;
    const maxPct = 100;
    const effective = Math.round(cw * maxPct / 100);

    const systemChars = layers.reduce((sum, l) => sum + (l.content?.length ?? 0), 0);
    const systemUsed = Math.round(systemChars / 4);

    return {
      contextWindow: cw,
      effectiveContext: effective,
      maxPct,
      layers: {
        system: { pct: systemPct, allocated: Math.round(cw * systemPct / 100), used: systemUsed },
        history: { pct: historyPct, allocated: Math.round(cw * historyPct / 100), used: 0 },
        memory: { pct: memoryPct, allocated: Math.round(cw * memoryPct / 100), used: 0 },
        rag: { pct: ragPct, allocated: Math.round(cw * ragPct / 100), used: 0 },
      },
    };
  }, [budgetOverview, modelContextWindow, layers]);

  const activeCount = enabledAgents.length + enabledGraphs.length;

  const availableModelIds = useMemo(
    () => new Set(models.filter((m) => m.is_available && !m.is_embedding).map((m) => `${m.provider}:${m.model_id}`)),
    [models],
  );

  const missingAgentModels = useMemo(() => {
    const missing: { agentName: string; modelId: string }[] = [];
    for (const agent of allAgents) {
      if (agent.model_id && !availableModelIds.has(agent.model_id)) {
        missing.push({ agentName: agent.name, modelId: agent.model_id });
      }
    }
    return missing;
  }, [allAgents, availableModelIds]);

  const overrideLocked = missingAgentModels.length > 0;

  return (
    <div>
      <SectionCard icon={Cpu} title="Model">
        {selectedModel ? (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium truncate">{selectedModel.display_name || selectedModel.name}</span>
            <Badge variant="secondary" className="text-[10px] h-4 shrink-0">{selectedModel.provider}</Badge>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No model selected</p>
        )}

        {effectiveOverview ? (
          <ContextUsage overview={effectiveOverview} />
        ) : null}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px]">Override agent models</span>
            {modelOverride && !overrideLocked && (
              <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
            )}
            {overrideLocked && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-3 w-3 text-warning" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-[10px]">
                    <p>Cannot disable — some agent models are not pulled:</p>
                    <ul className="mt-1 list-disc pl-3">
                      {missingAgentModels.map((m) => (
                        <li key={m.modelId}>{m.agentName}: {m.modelId}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <Switch
            checked={overrideLocked || modelOverride}
            onCheckedChange={onToggleOverride}
            disabled={overrideLocked}
          />
        </div>
      </SectionCard>

      {onSavePreferences && (
        <>
          <div className="border-t border-border/50" />
          <UserProfileSection
            preferences={userPreferences ?? ""}
            onSave={onSavePreferences}
          />
        </>
      )}

      <div className="border-t border-border/50" />

      <SectionCard
        icon={Route}
        title="Supervisor"
        trailing={
          <Switch checked={supervisorMode} onCheckedChange={onToggleSupervisor} />
        }
      >
        {supervisorMode && layers.length > 0 && (
          <div className="space-y-1.5">
            {layers.map((layer) => (
              <LayerEditor
                key={layer.key}
                layer={layer}
                onSave={onUpdateLayer}
              />
            ))}
          </div>
        )}
        {!supervisorMode && (
          <p className="text-[11px] text-muted-foreground">
            Messages are routed directly without supervisor orchestration.
          </p>
        )}
      </SectionCard>

      <div className="border-t border-border/50" />

      <SectionCard icon={Bot} title="Agents & Graphs" trailing={
        activeCount > 0 ? (
          <Badge variant="secondary" className="text-[10px] h-4">{activeCount}</Badge>
        ) : undefined
      }>
        {activeCount === 0 ? (
          <p className="text-[11px] text-muted-foreground">No agents or graphs enabled</p>
        ) : (
          <div className="space-y-1">
            {enabledAgents.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 border border-border/50 rounded-lg px-2.5 py-1.5 bg-muted/10"
              >
                <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block">{a.name}</span>
                  {a.description && (
                    <span className="text-[10px] text-muted-foreground truncate block">{a.description}</span>
                  )}
                </div>
              </div>
            ))}
            {enabledGraphs.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-2 border border-border/50 rounded-lg px-2.5 py-1.5 bg-muted/10"
              >
                <div className="h-5 w-5 rounded-md bg-info/10 flex items-center justify-center shrink-0">
                  <Workflow className="h-3 w-3 text-info" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block">{g.name}</span>
                  {g.description && (
                    <span className="text-[10px] text-muted-foreground truncate block">{g.description}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {metrics && (metrics.totalDurationMs != null || metrics.tokenUsage) && (
        <>
          <div className="border-t border-border/50" />
          <SectionCard icon={Zap} title="Last Execution">
            <div className="flex items-center gap-3 flex-wrap">
              {metrics.totalDurationMs != null && (
                <div className="flex items-center gap-1 text-[11px]">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono">{formatDuration(metrics.totalDurationMs)}</span>
                </div>
              )}
              {metrics.llmDurationMs != null && (
                <div className="flex items-center gap-1 text-[11px]">
                  <Zap className="h-3 w-3 text-warning" />
                  <span className="font-mono">{formatDuration(metrics.llmDurationMs)}</span>
                  {metrics.llmCalls > 1 && (
                    <span className="text-[10px] text-muted-foreground">({metrics.llmCalls})</span>
                  )}
                </div>
              )}
              {metrics.toolCalls > 0 && (
                <div className="flex items-center gap-1 text-[11px]">
                  <Wrench className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono">{metrics.toolCalls}</span>
                </div>
              )}
            </div>

            {metrics.tokenUsage && (
              <div className="border border-border/50 rounded-lg p-2.5 space-y-1">
                <div className="flex items-center text-[11px] gap-1">
                  <span className="font-mono text-muted-foreground">{formatK(metrics.tokenUsage.prompt)}</span>
                  <span className="text-muted-foreground/40">&rarr;</span>
                  <span className="font-mono text-muted-foreground">{formatK(metrics.tokenUsage.completion)}</span>
                  <span className="text-muted-foreground/40">=</span>
                  <span className="font-mono font-medium">{formatK(metrics.tokenUsage.total)}</span>
                  <span className="text-[10px] text-muted-foreground">tok</span>
                  {metrics.tokensPerSecond != null && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">{Math.round(metrics.tokensPerSecond)}</span> tok/s
                    </span>
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
