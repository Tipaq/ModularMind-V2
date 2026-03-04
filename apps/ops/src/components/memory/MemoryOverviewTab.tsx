import { useEffect } from "react";
import {
  Brain,
  Database,
  Eye,
  TrendingUp,
  Clock,
  Activity,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, cn } from "@modularmind/ui";
import { useMemoryStore } from "../../stores/memory";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Brain;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {sub && (
              <p className="text-xs text-muted-foreground truncate">{sub}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DistributionRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground capitalize">{label}</span>
        <span className="font-medium tabular-nums">
          {count.toLocaleString()} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  episodic: "bg-info",
  semantic: "bg-success",
  procedural: "bg-warning",
};

const SCOPE_COLORS: Record<string, string> = {
  user_profile: "bg-primary",
  agent: "bg-info",
  cross_conversation: "bg-success",
};

const TIER_COLORS: Record<string, string> = {
  vector: "bg-primary",
  structured: "bg-info",
};

export function MemoryOverviewTab() {
  const { globalStats, statsLoading, statsError, fetchGlobalStats } = useMemoryStore();

  useEffect(() => {
    fetchGlobalStats();
  }, [fetchGlobalStats]);

  if (statsLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="h-16 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
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
  const lastConsolidation = globalStats.last_consolidation
    ? new Date(globalStats.last_consolidation).toLocaleString()
    : "Never";

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Brain}
          label="Total Memories"
          value={total.toLocaleString()}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Importance"
          value={`${Math.round(globalStats.avg_importance * 100)}%`}
        />
        <StatCard
          icon={Eye}
          label="Total Accesses"
          value={globalStats.total_accesses.toLocaleString()}
        />
        <StatCard
          icon={Clock}
          label="Last Consolidation"
          value={lastConsolidation === "Never" ? "Never" : ""}
          sub={lastConsolidation !== "Never" ? lastConsolidation : undefined}
        />
      </div>

      {/* Distribution Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              By Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(globalStats.entries_by_type).map(([type, count]) => (
              <DistributionRow
                key={type}
                label={type}
                count={count}
                total={total}
                color={TYPE_COLORS[type] || "bg-muted-foreground"}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              By Scope
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(globalStats.entries_by_scope).map(([scope, count]) => (
              <DistributionRow
                key={scope}
                label={scope.replace("_", " ")}
                count={count}
                total={total}
                color={SCOPE_COLORS[scope] || "bg-muted-foreground"}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              By Tier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(globalStats.entries_by_tier).map(([tier, count]) => (
              <DistributionRow
                key={tier}
                label={tier}
                count={count}
                total={total}
                color={TIER_COLORS[tier] || "bg-muted-foreground"}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
