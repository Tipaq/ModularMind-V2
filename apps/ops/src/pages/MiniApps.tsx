import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppWindow, Search, RefreshCw } from "lucide-react";
import {
  PageHeader, Badge, Button, Input, cn,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  MiniAppCard,
} from "@modularmind/ui";
import type { MiniAppListResponse, MiniApp } from "@modularmind/api-client";
import { api } from "../lib/api";

export default function MiniApps() {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const navigate = useNavigate();

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scopeFilter !== "all") params.set("scope", scopeFilter);
      if (search) params.set("search", search);
      const data = await api.get<MiniAppListResponse>(`/mini-apps?${params}`);
      setApps(data.items || []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [scopeFilter, search]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={AppWindow}
        gradient="from-accent to-accent/70"
        title="Mini Apps"
        description="Web applications created by agents"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm font-mono">
              {apps.length} apps
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={loadApps}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
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
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
          <AppWindow className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            {search || scopeFilter !== "all"
              ? "No apps match your filters"
              : "No mini apps yet — ask an agent to create one"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <MiniAppCard
              key={app.id}
              id={app.id}
              name={app.name}
              description={app.description}
              scope={app.scope}
              icon={app.icon}
              version={app.version}
              agentId={app.agent_id}
              onClick={(id) => navigate(`/mini-apps/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
