import { memo } from "react";
import { FileText, Globe, Users, User, Trash2 } from "lucide-react";
import type { Collection } from "@modularmind/api-client";
import { Badge, Button, relativeTime } from "@modularmind/ui";

const SCOPE_CONFIG = {
  global: { label: "Company", icon: Globe, color: "text-info" },
  group:  { label: "Group",   icon: Users, color: "text-warning" },
  agent:  { label: "Personal", icon: User, color: "text-primary" },
} as const;

interface Props {
  collection: Collection;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

export const CollectionCard = memo(function CollectionCard({ collection, isSelected, onClick, onDelete, canDelete }: Props) {
  const scope = SCOPE_CONFIG[collection.scope] ?? SCOPE_CONFIG.global;
  const ScopeIcon = scope.icon;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 cursor-pointer transition-colors group ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border/50 bg-card/50 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium truncate text-sm">{collection.name}</h3>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{collection.document_count}</span>
          </div>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {collection.description && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{collection.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={`text-[10px] gap-1 ${scope.color}`}>
          <ScopeIcon className="h-2.5 w-2.5" />
          {scope.label}
        </Badge>
        {collection.allowed_groups.map((g) => (
          <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>
        ))}
      </div>

      {collection.last_sync && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Updated {relativeTime(collection.last_sync)}
        </p>
      )}
    </div>
  );
});
