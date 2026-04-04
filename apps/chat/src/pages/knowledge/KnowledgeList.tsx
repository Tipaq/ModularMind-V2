import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, FileText, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  Badge, Button, EmptyState, Input, ConfirmDialog,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  useAuthStore, relativeTime,
} from "@modularmind/ui";
import type { Collection, CollectionListResponse } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

type ScopeFilter = "all" | "global" | "group" | "agent";

const SCOPE_LABELS: Record<string, { label: string; color: string }> = {
  global: { label: "Company", color: "text-success" },
  group: { label: "Shared", color: "text-info" },
  agent: { label: "Personal", color: "text-warning" },
};

export function KnowledgeList() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<CollectionListResponse>("/rag/collections?page_size=200");
      setCollections(data.items ?? []);
    } catch {
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  const filtered = useMemo(() => {
    let items = collections;
    if (scopeFilter !== "all") {
      items = items.filter((c) => c.scope === scopeFilter);
    }
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter(
        (c) => c.name.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower),
      );
    }
    return items;
  }, [collections, scopeFilter, search]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/rag/collections/${deleteTarget.id}`);
      setCollections((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const canDelete = useCallback(
    (collection: Collection) => {
      if (!user) return false;
      if (user.role === "owner" || user.role === "admin") return true;
      return collection.owner_user_id === user.id;
    },
    [user],
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">Manage your document collections and RAG resources</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filtered.length} collections</Badge>
          <Button variant="ghost" size="sm" onClick={loadCollections} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search collections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as ScopeFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="global">Company</SelectItem>
            <SelectItem value="group">Shared</SelectItem>
            <SelectItem value="agent">Personal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={search || scopeFilter !== "all" ? "No collections match your filters" : "No collections yet"}
          description="Knowledge collections store documents for RAG-powered conversations."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((col) => (
            <CollectionCard
              key={col.id}
              collection={col}
              onClick={() => navigate(`/knowledge/${col.id}`)}
              onDelete={() => setDeleteTarget(col)}
              canDelete={canDelete(col)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="All documents and embeddings in this collection will be permanently deleted."
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface CollectionCardProps {
  collection: Collection;
  onClick: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function CollectionCard({ collection, onClick, onDelete, canDelete }: CollectionCardProps) {
  const scope = SCOPE_LABELS[collection.scope] ?? SCOPE_LABELS.global;

  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-border/50 bg-card/50 p-4 cursor-pointer transition-colors hover:bg-muted/30"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium truncate text-sm">{collection.name}</h3>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
            <FileText className="h-3 w-3" />
            <span className="text-xs text-muted-foreground">{collection.document_count}</span>
          </div>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
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
      <div className="mt-3 flex items-center gap-1.5">
        <Badge variant="outline" className={`text-[10px] ${scope.color}`}>
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
}

export default KnowledgeList;
