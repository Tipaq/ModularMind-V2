import { AlertTriangle } from "lucide-react";
import { Target, Brain } from "lucide-react";
import {
  Card,
  CardContent,
  cn,
} from "@modularmind/ui";
import type { ConfigGetter, ConfigSetter } from "./types";
import { NumberField, SliderField, SwitchField, SectionHeader } from "./shared";

// ── Types ────────────────────────────────────────────────────

export interface ScoringConfigProps {
  val: ConfigGetter;
  set: ConfigSetter;
}

// ── Weights Bar ──────────────────────────────────────────────

const WEIGHT_SEGMENTS = [
  { key: "recency" as const, label: "Recency", short: "Rec", color: "bg-info" },
  { key: "importance" as const, label: "Importance", short: "Imp", color: "bg-warning" },
  { key: "relevance" as const, label: "Relevance", short: "Rel", color: "bg-success" },
  { key: "frequency" as const, label: "Frequency", short: "Freq", color: "bg-primary" },
];

function WeightsBar({
  weights,
}: {
  weights: { recency: number; importance: number; relevance: number; frequency: number };
}) {
  const total = weights.recency + weights.importance + weights.relevance + weights.frequency;
  const isValid = Math.abs(total - 1.0) < 0.05;

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {WEIGHT_SEGMENTS.map((seg) => (
          <div
            key={seg.key}
            className={cn("h-full transition-all", seg.color)}
            style={{ width: `${(weights[seg.key] / (total || 1)) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex gap-3">
          {WEIGHT_SEGMENTS.map((seg) => (
            <span key={seg.key} className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", seg.color)} />
              {seg.short} {(weights[seg.key] * 100).toFixed(0)}%
            </span>
          ))}
        </div>
        <span className={cn("font-medium tabular-nums", isValid ? "text-success" : "text-destructive")}>
          {(total * 100).toFixed(0)}%
        </span>
      </div>
      {!isValid && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Weights should sum to 100%
        </div>
      )}
    </div>
  );
}

// ── Scoring Config ───────────────────────────────────────────

export function ScoringConfig({ val, set }: ScoringConfigProps) {
  return (
    <>
      {/* Scoring & Retrieval */}
      <Card>
        <SectionHeader
          icon={Target}
          title="Scoring & Retrieval"
          description="How each factor contributes to a memory's retrieval score. Weights should sum to 100%."
        />
        <CardContent className="space-y-5">
          <WeightsBar
            weights={{
              recency: val("score_weight_recency"),
              importance: val("score_weight_importance"),
              relevance: val("score_weight_relevance"),
              frequency: val("score_weight_frequency"),
            }}
          />

          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <SliderField
              label="Recency"
              description="How recently the memory was accessed"
              value={val("score_weight_recency")}
              onChange={(v) => set("score_weight_recency", v)}
            />
            <SliderField
              label="Importance"
              description="LLM-scored importance of the memory"
              value={val("score_weight_importance")}
              onChange={(v) => set("score_weight_importance", v)}
            />
            <SliderField
              label="Relevance"
              description="Semantic similarity to the current query"
              value={val("score_weight_relevance")}
              onChange={(v) => set("score_weight_relevance", v)}
            />
            <SliderField
              label="Frequency"
              description="How often the memory has been accessed"
              value={val("score_weight_frequency")}
              onChange={(v) => set("score_weight_frequency", v)}
            />
          </div>

          <div className="border-t border-border pt-4">
            <SliderField
              label="Min relevance gate"
              description="Entries below this vector similarity score are dropped regardless of other factors"
              value={val("min_relevance_gate")}
              onChange={(v) => set("min_relevance_gate", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* General */}
      <Card>
        <SectionHeader
          icon={Brain}
          title="General"
          description="Global memory system toggles and limits."
        />
        <CardContent>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <SwitchField
              label="Fact extraction"
              description="Automatically extract facts from conversations"
              checked={val("fact_extraction_enabled")}
              onChange={(v) => set("fact_extraction_enabled", v)}
            />
            <SwitchField
              label="Memory scorer"
              description="LLM-based importance scoring for extracted facts"
              checked={val("scorer_enabled")}
              onChange={(v) => set("scorer_enabled", v)}
            />
            <NumberField
              label="Max entries"
              description="Maximum memory entries per scope"
              value={val("max_entries")}
              onChange={(v) => set("max_entries", v)}
              min={100}
              max={10000}
            />
            <NumberField
              label="Min messages"
              description="Require before first extraction"
              value={val("fact_extraction_min_messages")}
              onChange={(v) => set("fact_extraction_min_messages", v)}
              min={1}
              max={100}
              unit="msgs"
            />
            <SliderField
              label="Scorer min importance"
              description="Discard facts below this importance score"
              value={val("scorer_min_importance")}
              onChange={(v) => set("scorer_min_importance", v)}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
