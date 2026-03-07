import { useEffect } from "react";
import {
  Database,
  FileText,
  Eye,
  Layers,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
} from "@modularmind/ui";
import { useKnowledgeStore } from "../../stores/knowledge";

// ── Helpers ──

const STATUS_META: Record<string, { label: string; color: string }> = {
  ready: { label: "Ready", color: "bg-success" },
  processing: { label: "Processing", color: "bg-warning" },
  pending: { label: "Pending", color: "bg-muted-foreground" },
  failed: { label: "Failed", color: "bg-destructive" },
};

const SCOPE_META: Record<string, { label: string; color: string }> = {
  global: { label: "Global", color: "bg-primary" },
  group: { label: "Group", color: "bg-info" },
  agent: { label: "Personal", color: "bg-warning" },
};

// ── Components ──

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
}: {
  icon: typeof Database;
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
  meta: Record<string, { label: string; color: string }>;
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

        {entries.map(([key, count]) => {
          const m = meta[key];
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", m?.color || "bg-muted-foreground")} />
                <span className="text-sm font-medium">{m?.label || key}</span>
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

// ── Main ──

export function KnowledgeOverviewTab() {
  const { globalStats, statsLoading, statsError, fetchGlobalStats } = useKnowledgeStore();

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
              <p className="text-sm font-medium">Failed to load knowledge stats</p>
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
        <BookOpen className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No knowledge data yet</p>
        <p className="text-xs mt-1">Upload documents to collections to see stats here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Database}
          label="Collections"
          value={globalStats.total_collections.toLocaleString()}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <KpiCard
          icon={FileText}
          label="Documents"
          value={globalStats.total_documents.toLocaleString()}
          iconColor="text-info"
          iconBg="bg-info/10"
        />
        <KpiCard
          icon={Layers}
          label="Chunks"
          value={globalStats.total_chunks.toLocaleString()}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <KpiCard
          icon={Eye}
          label="Total Accesses"
          value={globalStats.total_accesses.toLocaleString()}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DistributionCard
          icon={FileText}
          title="Documents by Status"
          data={globalStats.documents_by_status}
          total={globalStats.total_documents}
          meta={STATUS_META}
        />
        <DistributionCard
          icon={Database}
          title="Collections by Scope"
          data={globalStats.collections_by_scope}
          total={globalStats.total_collections}
          meta={SCOPE_META}
        />
      </div>
    </div>
  );
}
