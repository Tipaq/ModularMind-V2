import { Timer } from "lucide-react";
import { Card, CardContent } from "@modularmind/ui";
import type { ConfigGetter, ConfigSetter } from "./types";
import { NumberField, SliderField, SectionHeader } from "./shared";

// ── Types ────────────────────────────────────────────────────

export interface DecayConfigProps {
  val: ConfigGetter;
  set: ConfigSetter;
}

// ── Decay Config ─────────────────────────────────────────────

export function DecayConfig({ val, set }: DecayConfigProps) {
  return (
    <Card>
      <SectionHeader
        icon={Timer}
        title="Decay & Pruning"
        description="How memories fade over time. Half-life = days until importance drops 50% without access."
      />
      <CardContent className="space-y-4">
        <NumberField
          label="Episodic half-life"
          description="Events and experiences"
          value={val("decay_episodic_half_life")}
          onChange={(v) => set("decay_episodic_half_life", v)}
          min={1}
          unit="days"
        />
        <NumberField
          label="Semantic half-life"
          description="Facts and knowledge"
          value={val("decay_semantic_half_life")}
          onChange={(v) => set("decay_semantic_half_life", v)}
          min={1}
          unit="days"
        />
        <NumberField
          label="Procedural half-life"
          description="Skills and processes"
          value={val("decay_procedural_half_life")}
          onChange={(v) => set("decay_procedural_half_life", v)}
          min={1}
          unit="days"
        />
        <div className="pt-1">
          <SliderField
            label="Prune threshold"
            description="Delete entries below this importance during consolidation"
            value={val("decay_prune_threshold")}
            onChange={(v) => set("decay_prune_threshold", v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
