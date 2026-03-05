"use client";

import { useState } from "react";
import { AlertTriangle, Layers } from "lucide-react";
import {
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  cn,
} from "@modularmind/ui";
import type { ConfigGetter, ConfigSetter, CatalogModel } from "./types";
import { NumberField, SectionHeader } from "./shared";

// ── Types ────────────────────────────────────────────────────

export interface ConsolidationConfigProps {
  val: ConfigGetter;
  set: ConfigSetter;
  llmModels: CatalogModel[];
}

// ── Constants ────────────────────────────────────────────────

const BUDGET_LAYERS = [
  { key: "history" as const, label: "History", pctKey: "context_budget_history_pct" as const, color: "bg-info" },
  { key: "memory" as const, label: "Memory", pctKey: "context_budget_memory_pct" as const, color: "bg-warning" },
  { key: "rag" as const, label: "RAG", pctKey: "context_budget_rag_pct" as const, color: "bg-success" },
];

// ── Context Budget Card ──────────────────────────────────────

export function ConsolidationConfig({
  val,
  set,
  llmModels,
}: ConsolidationConfigProps) {
  const [previewModelId, setPreviewModelId] = useState<string | null>(null);

  const fullCW = previewModelId
    ? llmModels.find((m) => m.id === previewModelId)?.context_window ?? val("context_budget_default_context_window")
    : val("context_budget_default_context_window");

  const maxPct = val("context_budget_max_pct");
  const effectiveCW = Math.round(fullCW * maxPct / 100);

  const historyPct = val("context_budget_history_pct");
  const memoryPct = val("context_budget_memory_pct");
  const ragPct = val("context_budget_rag_pct");
  const totalLayerPct = historyPct + memoryPct + ragPct;
  const reservedPct = Math.max(0, 100 - totalLayerPct);
  const isValid = totalLayerPct <= 85;

  const formatK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);

  const handleLayerTokenChange = (pctKey: typeof BUDGET_LAYERS[number]["pctKey"], tokens: number) => {
    if (effectiveCW <= 0) return;
    const pct = Math.round((tokens / effectiveCW) * 1000) / 10;
    set(pctKey, Math.max(0, Math.min(pct, 100)));
  };

  const handleMaxPctTokenChange = (tokens: number) => {
    if (fullCW <= 0) return;
    const pct = Math.round((tokens / fullCW) * 1000) / 10;
    set("context_budget_max_pct", Math.max(10, Math.min(pct, 100)));
  };

  return (
    <Card>
      <SectionHeader
        icon={Layers}
        title="Context Budget"
        description="How context window is distributed across layers. Percentages auto-scale to each model's context size."
      />
      <CardContent className="space-y-5">
        {/* Model preview selector */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Preview model (for token calculations)</Label>
          <Select
            value={previewModelId ?? "__default__"}
            onValueChange={(v) => setPreviewModelId(v === "__default__" ? null : v)}
          >
            <SelectTrigger className="w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                Default ({formatK(val("context_budget_default_context_window"))} context)
              </SelectItem>
              {llmModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name} ({formatK(m.context_window ?? 0)} context)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Soft limit row */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-20 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary" />
              <Label className="text-sm">Soft limit</Label>
            </div>
            <div className="flex items-center gap-1.5 flex-1">
              <Input
                type="number"
                min={10}
                max={100}
                step={5}
                className="w-20 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={maxPct}
                onChange={(e) => set("context_budget_max_pct", Math.max(10, Math.min(Number(e.target.value) || 10, 100)))}
              />
              <span className="text-xs text-muted-foreground w-4">%</span>
            </div>
            <div className="flex items-center gap-1.5 flex-1">
              <Input
                type="number"
                min={0}
                step={1024}
                className="w-24 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={Math.round(fullCW * maxPct / 100)}
                onChange={(e) => handleMaxPctTokenChange(Number(e.target.value) || 0)}
              />
              <span className="text-xs text-muted-foreground w-6">tok</span>
            </div>
          </div>
          {maxPct < 100 && (
            <p className="text-[11px] text-muted-foreground ml-[86px]">
              Effective context: {formatK(effectiveCW)} of {formatK(fullCW)} — layers allocate within this cap
            </p>
          )}
        </div>

        {/* Budget allocation bar */}
        <div className="space-y-2">
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {BUDGET_LAYERS.map((layer) => {
              const pct = val(layer.pctKey) as number;
              return (
                <div
                  key={layer.key}
                  className={cn("h-full transition-all", layer.color)}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
            <div
              className="h-full bg-muted-foreground/20 transition-all"
              style={{ width: `${reservedPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex gap-3">
              {BUDGET_LAYERS.map((layer) => (
                <span key={layer.key} className="flex items-center gap-1">
                  <span className={cn("h-2 w-2 rounded-full", layer.color)} />
                  {layer.label} {(val(layer.pctKey) as number).toFixed(0)}%
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                Reserved {reservedPct.toFixed(0)}%
              </span>
            </div>
            <span className={cn("font-medium tabular-nums", isValid ? "text-success" : "text-destructive")}>
              {totalLayerPct.toFixed(0)}%
            </span>
          </div>
          {!isValid && (
            <div className="flex items-center gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Total exceeds 85% — leave room for system prompt + response
            </div>
          )}
        </div>

        {/* Per-layer dual inputs */}
        {BUDGET_LAYERS.map((layer) => {
          const pct = val(layer.pctKey) as number;
          const tokens = Math.round(effectiveCW * pct / 100);
          return (
            <div key={layer.key} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-20 shrink-0">
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", layer.color)} />
                <Label className="text-sm">{layer.label}</Label>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  type="number"
                  min={0}
                  max={60}
                  step={1}
                  className="w-20 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={pct}
                  onChange={(e) => set(layer.pctKey, Math.max(0, Math.min(Number(e.target.value) || 0, 60)))}
                />
                <span className="text-xs text-muted-foreground w-4">%</span>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  type="number"
                  min={0}
                  step={100}
                  className="w-24 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={tokens}
                  onChange={(e) => handleLayerTokenChange(layer.pctKey, Number(e.target.value) || 0)}
                />
                <span className="text-xs text-muted-foreground w-6">tok</span>
              </div>
            </div>
          );
        })}

        {/* Separator + absolute fields */}
        <div className="border-t border-border pt-4 space-y-4">
          <NumberField
            label="Default context window"
            description="Fallback when model metadata is unavailable"
            value={val("context_budget_default_context_window")}
            onChange={(v) => set("context_budget_default_context_window", v)}
            min={2048}
            max={200000}
            step={1024}
            unit="tok"
          />
        </div>
      </CardContent>
    </Card>
  );
}
