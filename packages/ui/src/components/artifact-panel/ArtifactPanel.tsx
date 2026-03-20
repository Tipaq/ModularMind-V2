"use client";

import { memo, useCallback } from "react";
import { X } from "lucide-react";
import type { DetectedArtifact } from "../../types/artifact";
import { ArtifactList } from "./ArtifactList";
import { ArtifactViewer } from "./ArtifactViewer";

interface ArtifactPanelProps {
  artifacts: DetectedArtifact[];
  selectedArtifactId: string | null;
  selectedArtifact: DetectedArtifact | null;
  onSelectArtifact: (id: string) => void;
  onClose: () => void;
}

export const ArtifactPanel = memo(function ArtifactPanel({
  artifacts,
  selectedArtifactId,
  selectedArtifact,
  onSelectArtifact,
  onClose,
}: ArtifactPanelProps) {
  const handleBack = useCallback(() => onSelectArtifact(""), [onSelectArtifact]);

  return (
    <div className="w-[480px] shrink-0 border-l border-border/50 flex flex-col bg-card/30">
      <div className="h-14 flex items-center justify-between px-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Artifacts</h3>
          {artifacts.length > 0 && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
              {artifacts.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Close panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {selectedArtifact ? (
          <ArtifactViewer artifact={selectedArtifact} onBack={handleBack} />
        ) : (
          <ArtifactList
            artifacts={artifacts}
            selectedArtifactId={selectedArtifactId}
            onSelect={onSelectArtifact}
          />
        )}
      </div>
    </div>
  );
});
