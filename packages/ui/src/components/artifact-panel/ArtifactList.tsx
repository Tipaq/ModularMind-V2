"use client";

import { memo } from "react";
import { FileCode2 } from "lucide-react";
import { cn } from "../../lib/utils";
import type { DetectedArtifact } from "../../types/artifact";

const MAX_PREVIEW_LINES = 3;

interface ArtifactListProps {
  artifacts: DetectedArtifact[];
  selectedArtifactId: string | null;
  onSelect: (id: string) => void;
}

export const ArtifactList = memo(function ArtifactList({
  artifacts,
  selectedArtifactId,
  onSelect,
}: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-6">
        <FileCode2 className="h-8 w-8 mb-2 opacity-40" />
        <p>No artifacts yet</p>
        <p className="text-xs mt-1">Code blocks and generated files will appear here</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {artifacts.map((artifact) => {
        const preview = artifact.content.split("\n").slice(0, MAX_PREVIEW_LINES).join("\n");
        const isSelected = artifact.id === selectedArtifactId;

        return (
          <button
            key={artifact.id}
            onClick={() => onSelect(artifact.id)}
            className={cn(
              "w-full text-left rounded-lg border p-3 transition-colors",
              isSelected
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:border-primary/30 hover:bg-muted/50",
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium truncate">{artifact.title}</span>
              <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                {artifact.lineCount} lines
              </span>
            </div>
            <pre className="text-[11px] text-muted-foreground overflow-hidden line-clamp-3 font-mono whitespace-pre">
              {preview}
            </pre>
          </button>
        );
      })}
    </div>
  );
});
