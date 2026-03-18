"use client";

import { Brain } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { PipelineData } from "@modularmind/api-client";
import { dotColor } from "../../../lib/monitoringUtils";

const MEMORY_STREAMS = [
  { key: "memory:raw", label: "Raw Events", description: "Incoming conversation messages" },
  { key: "memory:extracted", label: "Extracted Facts", description: "LLM-extracted facts from raw events" },
  { key: "memory:scored", label: "Scored Memory", description: "Scored and deduplicated facts" },
];

interface MemoryPipelineSectionProps {
  pipeline: PipelineData | null;
}

export function MemoryPipelineSection({ pipeline }: MemoryPipelineSectionProps) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        Memory Pipeline
      </h2>

      <div className="rounded-xl border border-border/50 bg-card/50 p-5">
        {/* Pipeline flow diagram */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-3">
            Raw messages → LLM fact extraction → Scoring & dedup → Vector store
          </p>
        </div>

        {/* Stream status rows */}
        <div className="space-y-3">
          {MEMORY_STREAMS.map(({ key, label, description }) => {
            const info = pipeline?.[key];
            const count = info?.length ?? 0;

            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className={cn("h-2.5 w-2.5 rounded-full", dotColor(count))} />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={cn("text-lg font-bold tabular-nums", count > 0 ? "text-warning" : "text-foreground")}>
                      {count}
                    </p>
                    <p className="text-[10px] text-muted-foreground">pending</p>
                  </div>
                  {info && (
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums">{info.consumers}</p>
                      <p className="text-[10px] text-muted-foreground">consumers</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Health summary */}
        {pipeline && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <div className="flex items-center gap-2">
              {MEMORY_STREAMS.every(({ key }) => (pipeline[key]?.length ?? 0) === 0) ? (
                <span className="text-xs text-success">All streams healthy — no backlog</span>
              ) : (
                <span className="text-xs text-warning">
                  {MEMORY_STREAMS.reduce((sum, { key }) => sum + (pipeline[key]?.length ?? 0), 0)} messages pending across streams
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
