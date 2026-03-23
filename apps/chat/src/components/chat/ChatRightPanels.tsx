import { InsightsPanel, ArtifactPanel } from "@modularmind/ui";
import type { InsightsPanelProps } from "@modularmind/ui";
import type { DetectedArtifact } from "@modularmind/ui";

type RightPanel = "insights" | "artifacts" | null;

interface ArtifactPanelProps {
  artifacts: DetectedArtifact[];
  selectedArtifactId: string | null;
  selectedArtifact: DetectedArtifact | null;
  onSelectArtifact: (id: string) => void;
}

interface ChatRightPanelsProps {
  rightPanel: RightPanel;
  onCloseArtifacts: () => void;
  insightsProps: InsightsPanelProps;
  artifactProps: ArtifactPanelProps;
}

export function ChatRightPanels({
  rightPanel, onCloseArtifacts, insightsProps, artifactProps,
}: ChatRightPanelsProps) {
  if (rightPanel === "insights") {
    return <InsightsPanel {...insightsProps} />;
  }

  if (rightPanel === "artifacts") {
    return (
      <ArtifactPanel
        {...artifactProps}
        onClose={onCloseArtifacts}
      />
    );
  }

  return null;
}
