import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  Database,
  Eye,
  TrendingUp,
  Clock,
  Activity,
  AlertCircle,
  Layers,
  Settings2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
} from "@modularmind/ui";
import { useMemoryStore } from "../../stores/memory";

// ---- Helpers ----

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const TYPE_META: Record<string, { label: string; color: string; desc: string }> = {
  episodic: { label: "Episodic", color: "bg-info", desc: "Events & interactions" },
  semantic: { label: "Semantic", color: "bg-success", desc: "Facts & knowledge" },
  procedural: { label: "Procedural", color: "bg-warning", desc: "How-to & preferences" },
};

const SCOPE_META: Record<string, { label: string; color: string; desc: string }> = {
  user_profile: { label: "User Profile", color: "bg-primary", desc: "Per-user long-term" },
  agent: { label: "Agent", color: "bg-info", desc: "Agent-specific context" },
  conversation: { label: "Conversation", color: "bg-warning", desc: "Single conversation" },
  cross_conversation: { label: "Cross-Conv.", color: "bg-success", desc: "Shared across chats" },
};

const TIER_META: Record<string, { label: string; color: string; desc: string }> = {
  buffer: { label: "Buffer", color: "bg-muted-foreground", desc: "Short-term staging" },
  summary: { label: "Summary", color: "bg-warning", desc: "Condensed summaries" },
  vector: { label: "Vector", color: "bg-primary", desc: "Qdrant embeddings" },
  archive: { label: "Archive", color: "bg-info", desc: "Long-term storage" },
};

// ---- Components ----

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
}: {
  icon: typeof Brain;
  label: string;
  value: string | number;
  sub?: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
            {sub && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportanceGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 60 ? "text-success" : pct >= 30 ? "text-warning" : "text-destructive";
  const barColor =
    pct >= 60 ? "bg-success" : pct >= 30 ? "bg-warning" : "bg-destructive";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className={cn("text-lg font-bold tabular-nums", color)}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function DistributionCard({
  icon: Icon,
  title,
  data,
  total,
  meta,
}: {
  icon: typeof Database;
  title: string;
  data: Record<string, number>;
  total: number;
  meta: Record<string, { label: string; color: string; desc: string }>;
}) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Segmented bar */}
        {total > 0 && (
          <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
            {entries.map(([key, count]) => {
              const pct = (count / total) * 100;
              if (pct === 0) return null;
              const m = meta[key];
              return (
                <div
                  key={key}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", m?.color || "bg-muted-foreground")}
                  style={{ width: `${pct}%` }}
                  title={`${m?.label || key}: ${count}`}
                />
              );
            })}
          </div>
        )}

        {/* Detail rows */}
        {entries.map(([key, count]) => {
          const m = meta[key];
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", m?.color || "bg-muted-foreground")} />
                <div className="min-w-0">
                  <span className="text-sm font-medium">{m?.label || key}</span>
                  <span className="text-[11px] text-muted-foreground ml-1.5 hidden sm:inline">
                    {m?.desc}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold tabular-nums">{count.toLocaleString()}</span>
                <Badge variant="outline" className="text-[10px] tabular-nums px-1.5 py-0">
                  {pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%
                </Badge>
              </div>
            </div>
          );
        })}

        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No data</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Main ----

export function MemoryOverviewTab() {
  const navigate = useNavigate();
  const { globalStats, statsLoading, statsError, fetchGlobalStats } = useMemoryStore();

  useEffect(() => {
    fetchGlobalStats();
  }, [fetchGlobalStats]);

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-5 pb-4">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 pb-4">
                <div className="h-32 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (statsError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Failed to load memory stats</p>
              <p className="text-xs text-muted-foreground mt-0.5">{statsError}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!globalStats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Brain className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No memory data yet</p>
        <p className="text-xs mt-1">Memory entries will appear here once conversations generate facts.</p>
      </div>
    );
  }

  const total = globalStats.total_entries;
  const avgAccessPerMemory = total > 0
    ? (globalStats.total_accesses / total).toFixed(1)
    : "0";

  const lastConsol = globalStats.last_consolidation;
  const lastConsolDisplay = lastConsol ? timeAgo(lastConsol) : "Never";
  const lastConsolFull = lastConsol
    ? new Date(lastConsol).toLocaleString()
    : undefined;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Brain}
          label="Total Memories"
          value={total.toLocaleString()}
          sub={`${Object.keys(globalStats.entries_by_scope).filter(k => globalStats.entries_by_scope[k] > 0).length} active scopes`}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <KpiCard
          icon={Eye}
          label="Total Accesses"
          value={globalStats.total_accesses.toLocaleString()}
          sub={`~${avgAccessPerMemory} per memory`}
          iconColor="text-info"
          iconBg="bg-info/10"
        />
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Importance</p>
                </div>
              </div>
              <ImportanceGauge value={globalStats.avg_importance} />
            </div>
          </CardContent>
        </Card>
        <KpiCard
          icon={Clock}
          label="Last Consolidation"
          value={lastConsolDisplay}
          sub={lastConsolFull}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
      </div>

      {/* Configure shortcut */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/configuration?tab=memory")}
        >
          <Settings2 className="h-3.5 w-3.5 mr-1.5" />
          Configure Memory
        </Button>
      </div>

      {/* Distribution Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <DistributionCard
          icon={Layers}
          title="By Type"
          data={globalStats.entries_by_type}
          total={total}
          meta={TYPE_META}
        />
        <DistributionCard
          icon={Activity}
          title="By Scope"
          data={globalStats.entries_by_scope}
          total={total}
          meta={SCOPE_META}
        />
        <DistributionCard
          icon={Database}
          title="By Tier"
          data={globalStats.entries_by_tier}
          total={total}
          meta={TIER_META}
        />
      </div>
    </div>
  );
}
