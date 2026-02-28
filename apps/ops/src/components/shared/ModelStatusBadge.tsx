import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  KeyRound,
  Loader2,
} from "lucide-react";

interface ModelStatusBadgeProps {
  model: {
    pull_status: string | null;
    pull_progress: number | null;
    pull_error: string | null;
    provider: string;
  };
  configured: boolean;
}

export function ModelStatusBadge({ model, configured }: ModelStatusBadgeProps) {
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning">
        <KeyRound className="h-3.5 w-3.5" /> No credentials
      </span>
    );
  }
  if (model.pull_status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
      </span>
    );
  }
  if (model.pull_status === "downloading") {
    const pct = model.pull_progress ? Math.round(model.pull_progress * 100) : 0;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-info">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {pct}%
      </span>
    );
  }
  if (model.pull_status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-destructive"
        title={model.pull_error || ""}
      >
        <AlertCircle className="h-3.5 w-3.5" /> Error
      </span>
    );
  }
  if (model.provider !== "ollama") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <Cloud className="h-3.5 w-3.5" /> Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Download className="h-3.5 w-3.5" /> Not pulled
    </span>
  );
}
