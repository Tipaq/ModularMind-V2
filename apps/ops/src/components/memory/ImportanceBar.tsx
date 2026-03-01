import { cn } from "@modularmind/ui";

function getImportanceColor(value: number): string {
  if (value >= 0.8) return "bg-success";
  if (value >= 0.5) return "bg-warning";
  return "bg-destructive";
}

export function ImportanceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", getImportanceColor(value))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}
