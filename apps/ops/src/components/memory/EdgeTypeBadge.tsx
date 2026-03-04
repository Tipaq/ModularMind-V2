import { Badge, cn } from "@modularmind/ui";

const EDGE_STYLES: Record<string, string> = {
  entity_overlap: "bg-primary/15 text-primary border-primary/30",
  same_category: "bg-info/15 text-info border-info/30",
  semantic_similarity: "bg-success/15 text-success border-success/30",
};

const EDGE_LABELS: Record<string, string> = {
  entity_overlap: "Entity Overlap",
  same_category: "Same Category",
  semantic_similarity: "Semantic Similarity",
};

export function EdgeTypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium", EDGE_STYLES[type])}
    >
      {EDGE_LABELS[type] || type}
    </Badge>
  );
}
