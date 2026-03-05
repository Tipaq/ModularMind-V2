import { Settings2 } from "lucide-react";
import { Card, CardContent } from "@modularmind/ui";
import type { ConfigGetter, ConfigSetter } from "./types";
import { NumberField, SectionHeader } from "./shared";

// ── Types ────────────────────────────────────────────────────

export interface ExtractionConfigProps {
  val: ConfigGetter;
  set: ConfigSetter;
}

// ── Extraction Config ────────────────────────────────────────

export function ExtractionConfig({ val, set }: ExtractionConfigProps) {
  return (
    <Card>
      <SectionHeader
        icon={Settings2}
        title="Extraction"
        description="When the system extracts facts from conversations into memory entries."
      />
      <CardContent className="space-y-4">
        <NumberField
          label="Batch size"
          description="Extract after this many new messages"
          value={val("extraction_batch_size")}
          onChange={(v) => set("extraction_batch_size", v)}
          min={5}
          max={100}
          unit="msgs"
        />
        <NumberField
          label="Idle timeout"
          description="Extract when conversation is idle"
          value={val("extraction_idle_seconds")}
          onChange={(v) => set("extraction_idle_seconds", v)}
          min={60}
          max={3600}
          unit="sec"
        />
        <NumberField
          label="Scan interval"
          description="How often the scheduler checks for extractions"
          value={val("extraction_scan_interval")}
          onChange={(v) => set("extraction_scan_interval", v)}
          min={30}
          max={600}
          unit="sec"
        />
        <NumberField
          label="Buffer threshold"
          description="Trigger when unextracted tokens exceed this"
          value={val("buffer_token_threshold")}
          onChange={(v) => set("buffer_token_threshold", v)}
          min={500}
          max={20000}
          step={500}
          unit="tok"
        />
      </CardContent>
    </Card>
  );
}
