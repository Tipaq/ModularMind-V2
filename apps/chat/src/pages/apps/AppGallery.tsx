import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppWindow, RefreshCw, Search } from "lucide-react";
import {
  Badge, Button, EmptyState, Input, MiniAppCard,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@modularmind/ui";
import type { MiniApp, MiniAppListResponse } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

type ScopeFilter = "all" | "GLOBAL" | "GROUP" | "PERSONAL";

export function AppGallery() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: "200" });
      if (scopeFilter !== "all") params.set("scope", scopeFilter);
      const data = await api.get<MiniAppListResponse>(`/mini-apps?${params}`);
      setApps(data.items ?? []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [scopeFilter]);

  useEffect(() => { loadApps(); }, [loadApps]);

  const filtered = useMemo(() => {
    if (!search) return apps;
    const lower = search.toLowerCase();
    return apps.filter(
      (a) => a.name.toLowerCase().includes(lower) || a.description.toLowerCase().includes(lower),
    );
  }, [apps, search]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Mini-Apps</h1>
          <p className="text-sm text-muted-foreground">Browse and interact with apps created by agents</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filtered.length} apps</Badge>
          <Button variant="ghost" size="sm" onClick={loadApps} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
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
            <SelectItem value="GLOBAL">Global</SelectItem>
            <SelectItem value="GROUP">Group</SelectItem>
            <SelectItem value="PERSONAL">Personal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={AppWindow}
          title={search || scopeFilter !== "all" ? "No apps match your filters" : "No mini-apps yet"}
          description="Apps created by agents during conversations will appear here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app) => (
            <MiniAppCard
              key={app.id}
              id={app.id}
              name={app.name}
              description={app.description}
              scope={app.scope}
              icon={app.icon}
              version={app.version}
              agentId={app.agent_id}
              onClick={(id) => navigate(`/apps/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default AppGallery;
