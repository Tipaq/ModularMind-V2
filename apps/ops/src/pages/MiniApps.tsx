import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppWindow, Search, Globe, Users, User } from "lucide-react";
import { MiniAppCard } from "@modularmind/ui";
const PLATFORM_URL = window.location.origin.replace(":3003", ":3000");
const ENGINE_KEY = "mmk_dev-engine-api-key-2024";
const PLATFORM_HEADERS = { "X-Engine-Key": ENGINE_KEY };

interface MiniApp {
  id: string;
  name: string;
  slug: string;
  description: string;
  scope: string;
  icon: string | null;
  version: number;
  agentId: string | null;
  isActive: boolean;
  createdAt: string;
}

const SCOPE_FILTERS = [
  { value: "", label: "All", icon: AppWindow },
  { value: "GLOBAL", label: "Global", icon: Globe },
  { value: "GROUP", label: "Group", icon: Users },
  { value: "PERSONAL", label: "Personal", icon: User },
] as const;

export default function MiniApps() {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const navigate = useNavigate();

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scopeFilter) params.set("scope", scopeFilter);
      if (search) params.set("search", search);
      const res = await fetch(`${PLATFORM_URL}/api/mini-apps?${params}`, { headers: PLATFORM_HEADERS });
      const data = await res.json();
      setApps(data.items || data || []);
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mini Apps</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Web applications created by agents
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-input p-1">
          {SCOPE_FILTERS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setScopeFilter(value)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                scopeFilter === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AppWindow className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No mini apps yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Ask an agent to create a mini app for you.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <MiniAppCard
              key={app.id}
              id={app.id}
              name={app.name}
              description={app.description}
              scope={app.scope}
              icon={app.icon}
              version={app.version}
              agentId={app.agentId}
              onClick={(id) => navigate(`/mini-apps/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
