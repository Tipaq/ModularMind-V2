import { Badge, cn } from "@modularmind/ui";

const TYPE_STYLES: Record<string, string> = {
  episodic: "bg-info/15 text-info border-info/30",
  semantic: "bg-success/15 text-success border-success/30",
  procedural: "bg-warning/15 text-warning border-warning/30",
};

const TYPE_LABELS: Record<string, string> = {
  episodic: "Episodic",
  semantic: "Semantic",
  procedural: "Procedural",
};

export function MemoryTypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium", TYPE_STYLES[type])}
    >
      {TYPE_LABELS[type] || type}
    </Badge>
  );
}
