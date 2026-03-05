"use client";

import { useState, useMemo } from "react";
import {
  Clock,
  Wrench,
  Zap,
  Pencil,
  Loader2,
} from "lucide-react";
import { Badge, Button, cn, Switch } from "@modularmind/ui";
import type { EngineModel, SupervisorLayer } from "@/hooks/useChatConfig";

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
}

// ── Helpers ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
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
}: ConfigTabProps) {
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
