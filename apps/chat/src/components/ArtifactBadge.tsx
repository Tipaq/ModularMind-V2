import { AppWindow } from "lucide-react";

interface ArtifactBadgeProps {
  appId: string;
  appName: string;
  onClick: (appId: string) => void;
}

export function ArtifactBadge({ appId, appName, onClick }: ArtifactBadgeProps) {
  return (
    <button
      onClick={() => onClick(appId)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-2 rounded-md border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
    >
      <AppWindow className="h-3.5 w-3.5" />
      Open {appName}
    </button>
  );
}
