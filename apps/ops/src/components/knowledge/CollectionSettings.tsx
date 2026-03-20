import { Settings, Globe, Users, User } from "lucide-react";
import { Badge } from "@modularmind/ui";
import type { Collection } from "@modularmind/api-client";

const SCOPE_CONFIG = {
  global: { label: "Company", icon: Globe, color: "text-info" },
  group: { label: "Group", icon: Users, color: "text-warning" },
  agent: { label: "Personal", icon: User, color: "text-primary" },
} as const;

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0 text-sm text-right">{children}</div>
    </div>
  );
}

interface Props {
  collection: Collection;
}

export function CollectionSettings({ collection }: Props) {
  const scope = SCOPE_CONFIG[collection.scope] ?? SCOPE_CONFIG.global;
  const ScopeIcon = scope.icon;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Settings className="h-3.5 w-3.5" />
        Settings
      </div>
      <div className="rounded-lg border divide-y">
        <div className="px-4">
          <PropRow label="Scope">
            <Badge variant="outline" className={`gap-1 ${scope.color}`}>
              <ScopeIcon className="h-3 w-3" />
              {scope.label}
            </Badge>
          </PropRow>
        </div>
        <div className="px-4">
          <PropRow label="Chunk Size">
            <span className="tabular-nums">{collection.chunk_size}</span>
          </PropRow>
        </div>
        <div className="px-4">
          <PropRow label="Chunk Overlap">
            <span className="tabular-nums">{collection.chunk_overlap}</span>
          </PropRow>
        </div>
        {collection.allowed_groups.length > 0 && (
          <div className="px-4">
            <PropRow label="Groups">
              <div className="flex flex-wrap gap-1 justify-end">
                {collection.allowed_groups.map((group) => (
                  <Badge key={group} variant="secondary" className="text-xs">
                    {group}
                  </Badge>
                ))}
              </div>
            </PropRow>
          </div>
        )}
        {collection.created_at && (
          <div className="px-4">
            <PropRow label="Created">
              {new Date(collection.created_at).toLocaleDateString()}
            </PropRow>
          </div>
        )}
      </div>
    </div>
  );
}
