import { useEffect, useState } from "react";
import { RefreshCw, Brain, Search, Trash2 } from "lucide-react";
import { Card, CardContent, Badge, Button, Input } from "@modularmind/ui";
import { api } from "../../lib/api";
import { Pagination } from "../shared/Pagination";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import type { MemoryEntry, MemoryListResponse } from "./types";

const TIER_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  buffer: "default",
  summary: "secondary",
  vector: "outline",
  archive: "outline",
};

const SCOPE_OPTIONS = [
  { value: "", label: "All scopes" },
  { value: "agent", label: "Agent" },
  { value: "user_profile", label: "User Profile" },
  { value: "conversation", label: "Conversation" },
  { value: "cross_conversation", label: "Cross-conversation" },
];

const TIER_OPTIONS = [
  { value: "", label: "All tiers" },
  { value: "buffer", label: "Buffer" },
  { value: "summary", label: "Summary" },
  { value: "vector", label: "Vector" },
  { value: "archive", label: "Archive" },
];

export function UserMemoryTab({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), page_size: "20" });
        if (scopeFilter) params.set("scope", scopeFilter);
        if (tierFilter) params.set("tier", tierFilter);
        if (search) params.set("search", search);
        const res = await api.get<MemoryListResponse>(
          `/admin/users/${userId}/memory?${params}`,
        );
        if (active) {
          setEntries(res.items);
          setTotal(res.total);
        }
      } catch {
        if (active) setEntries([]);
      }
      if (active) setLoading(false);
    }
    fetchData();
    return () => { active = false; };
  }, [userId, page, scopeFilter, tierFilter, search]);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await api.delete(`/admin/users/${userId}/memory`);
      setEntries([]);
      setTotal(0);
    } catch {
      // handled silently
    }
    setClearing(false);
    setClearOpen(false);
  };

  const pageCount = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search memory content..."
            className="pl-9"
          />
        </div>

        <select
          value={scopeFilter}
          onChange={(e) => {
            setScopeFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {SCOPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {total > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setClearOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Clear All
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {total} memory entr{total !== 1 ? "ies" : "y"}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Brain className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {search || scopeFilter || tierFilter
              ? "No entries match filters."
              : "No memory entries."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={TIER_VARIANT[entry.tier] || "secondary"}
                        className="text-[10px]"
                      >
                        {entry.tier}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {entry.scope}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        importance: {entry.importance.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words line-clamp-3">
                      {entry.content}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span>Accessed {entry.access_count}x</span>
                      {entry.last_accessed && (
                        <span>
                          Last: {new Date(entry.last_accessed).toLocaleDateString()}
                        </span>
                      )}
                      <span>
                        Created: {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={pageCount} total={total} onPageChange={setPage} />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear All Memory"
        description="This will permanently delete all memory entries (PostgreSQL + Qdrant) for this user. This action cannot be undone."
        confirmLabel="Clear All Memory"
        destructive
        loading={clearing}
        onConfirm={handleClearAll}
      />
    </div>
  );
}
