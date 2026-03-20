"use client";

import { memo, useCallback } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { CopyButton } from "../copy-button";
import { CodeBlock } from "../code-block";
import type { DetectedArtifact } from "../../types/artifact";

interface ArtifactViewerProps {
  artifact: DetectedArtifact;
  onBack: () => void;
}

function downloadArtifact(artifact: DetectedArtifact) {
  const blob = new Blob([artifact.content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.title;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const ArtifactViewer = memo(function ArtifactViewer({
  artifact,
  onBack,
}: ArtifactViewerProps) {
  const handleDownload = useCallback(() => downloadArtifact(artifact), [artifact]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <button
          onClick={onBack}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Back to list"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{artifact.title}</p>
          <p className="text-[10px] text-muted-foreground">
            {artifact.language} — {artifact.lineCount} lines
          </p>
        </div>
        <CopyButton content={artifact.content} />
        <button
          onClick={handleDownload}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <CodeBlock language={artifact.language}>{artifact.content}</CodeBlock>
      </div>
    </div>
  );
});
