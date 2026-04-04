"use client";

import { useState, useMemo } from "react";
import {
  Bot,
  Clock,
  Loader2,
  User,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "../badge";
import { SectionCard } from "../section-card";
import { cn } from "../../lib/utils";
import type { BudgetOverview } from "../../types/chat";
import type { ToolCategoryEntry } from "../../lib/chat-config";
import type { EngineAgent, EngineGraph, EngineModel, SupervisorLayer } from "@modularmind/api-client";
import { ModelSelector } from "./ModelSelector";
import { SupervisorSection } from "./SupervisorSection";

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
  supervisorToolCategories?: string[] | null;
  onToggleToolCategory?: (category: string, enabled: boolean) => void;
  mcpCategories?: ToolCategoryEntry[];
}

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

function UserProfileSection({ preferences, onSave }: { preferences: string; onSave: (prefs: string) => Promise<void> }) {
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const handleBlur = async () => {
    if (draft === preferences) return;
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
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
        <span className={cn("text-[10px] font-mono", overLimit ? "text-destructive" : "text-muted-foreground/50")}>
          {charCount} / 2000
        </span>
        <span className="text-[10px] text-muted-foreground/40">Saves on blur</span>
      </div>
    </SectionCard>
  );
}

export function ConfigTab({
  models, selectedModelId, modelOverride, onToggleOverride,
  supervisorMode, onToggleSupervisor, layers, onUpdateLayer,
  metrics, budgetOverview, modelContextWindow,
  enabledAgents, enabledGraphs, allAgents,
  userPreferences, onSavePreferences,
  supervisorToolCategories, onToggleToolCategory,
  mcpCategories,
}: ConfigTabProps) {
  const effectiveOverview = useMemo<BudgetOverview | null>(() => {
    if (budgetOverview) return budgetOverview;
    const cw = modelContextWindow;
    if (!cw || cw <= 0) return null;
    const systemChars = layers.reduce((sum, l) => sum + (l.content?.length ?? 0), 0);
    const systemUsed = Math.round(systemChars / 4);
    return {
      contextWindow: cw, effectiveContext: cw, maxPct: 100,
      layers: {
        system: { pct: 10, allocated: Math.round(cw * 0.1), used: systemUsed },
        history: { pct: 30, allocated: Math.round(cw * 0.3), used: 0 },
        memory: { pct: 10, allocated: Math.round(cw * 0.1), used: 0 },
        rag: { pct: 15, allocated: Math.round(cw * 0.15), used: 0 },
      },
    };
  }, [budgetOverview, modelContextWindow, layers]);

  const activeCount = enabledAgents.length + enabledGraphs.length;

  return (
    <div>
      <ModelSelector
        models={models}
        selectedModelId={selectedModelId}
        modelOverride={modelOverride}
        onToggleOverride={onToggleOverride}
        budgetOverview={effectiveOverview}
        allAgents={allAgents}
      />

      {onSavePreferences && (
        <>
          <div className="border-t border-border/50" />
          <UserProfileSection preferences={userPreferences ?? ""} onSave={onSavePreferences} />
        </>
      )}

      <div className="border-t border-border/50" />

      <SupervisorSection
        supervisorMode={supervisorMode}
        onToggleSupervisor={onToggleSupervisor}
        layers={layers}
        onUpdateLayer={onUpdateLayer}
        supervisorToolCategories={supervisorToolCategories}
        onToggleToolCategory={onToggleToolCategory}
        mcpCategories={mcpCategories}
      />

      <div className="border-t border-border/50" />

      <SectionCard icon={Bot} title="Agents & Graphs" trailing={
        activeCount > 0 ? <Badge variant="secondary" className="text-[10px] h-4">{activeCount}</Badge> : undefined
      }>
        {activeCount === 0 ? (
          <p className="text-[11px] text-muted-foreground">No agents or graphs enabled</p>
        ) : (
          <div className="space-y-1">
            {enabledAgents.map((a) => (
              <div key={a.id} className="flex items-center gap-2 border border-border/50 rounded-lg px-2.5 py-1.5 bg-muted/10">
                <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block">{a.name}</span>
                  {a.description && <span className="text-[10px] text-muted-foreground truncate block">{a.description}</span>}
                </div>
              </div>
            ))}
            {enabledGraphs.map((g) => (
              <div key={g.id} className="flex items-center gap-2 border border-border/50 rounded-lg px-2.5 py-1.5 bg-muted/10">
                <div className="h-5 w-5 rounded-md bg-info/10 flex items-center justify-center shrink-0">
                  <Workflow className="h-3 w-3 text-info" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block">{g.name}</span>
                  {g.description && <span className="text-[10px] text-muted-foreground truncate block">{g.description}</span>}
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
                  {metrics.llmCalls > 1 && <span className="text-[10px] text-muted-foreground">({metrics.llmCalls})</span>}
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
