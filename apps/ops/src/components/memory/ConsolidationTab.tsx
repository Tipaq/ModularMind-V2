import { useEffect, useMemo, useCallback, useState } from "react";
import {
  Play,
  Clock,
  TrendingDown,
  Trash2,
  Layers,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Timer,
  AlertCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  Separator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modularmind/ui";
import { useMemoryStore, type ConsolidationLog } from "../../stores/memory";
import { ResourceTable } from "../shared/ResourceTable";
import { EmptyState } from "../shared/EmptyState";
import type { ResourceColumn } from "@modularmind/ui";

const PAGE_SIZE = 20;

const ACTION_STYLES: Record<string, { bg: string; icon: typeof CheckCircle2 }> = {
  decayed: { bg: "bg-primary/15 text-primary border-primary/30", icon: TrendingDown },
  merged: { bg: "bg-info/15 text-info border-info/30", icon: Layers },
  invalidated: { bg: "bg-destructive/15 text-destructive border-destructive/30", icon: Trash2 },
  manual_invalidate: { bg: "bg-warning/15 text-warning border-warning/30", icon: AlertCircle },
  promoted: { bg: "bg-success/15 text-success border-success/30", icon: CheckCircle2 },
  kept: { bg: "bg-muted text-muted-foreground", icon: CheckCircle2 },
};

const ACTION_LABELS: Record<string, string> = {
  decayed: "Decayed",
  merged: "Merged",
  invalidated: "Invalidated",
  manual_invalidate: "Manual Invalidate",
  promoted: "Promoted",
  kept: "Kept",
};

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
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function StatMini({
  icon: Icon,
  label,
  value,
  color = "text-primary",
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-muted/80")}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function ConsolidationTab() {
  const {
    consolLogs,
    consolTotal,
    consolPage,
    consolLoading,
    consolError,
    consolTriggering,
    consolTriggerResult,
    consolTriggerError,
    fetchConsolidationLogs,
    triggerConsolidation,
    clearTriggerResult,
    globalStats,
    fetchGlobalStats,
  } = useMemoryStore();

  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    fetchConsolidationLogs(1);
    if (!globalStats) fetchGlobalStats();
  }, [fetchConsolidationLogs, fetchGlobalStats, globalStats]);

  const handlePageChange = useCallback(
    (page: number) => {
      fetchConsolidationLogs(page);
    },
    [fetchConsolidationLogs],
  );

  const handleTrigger = useCallback(() => {
    clearTriggerResult();
    triggerConsolidation();
  }, [triggerConsolidation, clearTriggerResult]);

  const handleRefresh = useCallback(() => {
    fetchConsolidationLogs(1);
    fetchGlobalStats();
  }, [fetchConsolidationLogs, fetchGlobalStats]);

  // Compute action distribution from current logs
  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of consolLogs) {
      counts[log.action] = (counts[log.action] || 0) + 1;
    }
    return counts;
  }, [consolLogs]);

  const filteredLogs = useMemo(
    () =>
      actionFilter === "all"
        ? consolLogs
        : consolLogs.filter((log) => log.action === actionFilter),
    [consolLogs, actionFilter],
  );

  const lastConsolidation = globalStats?.last_consolidation
    ? timeAgo(globalStats.last_consolidation)
    : "Never";

  const columns: ResourceColumn<ConsolidationLog>[] = useMemo(
    () => [
      {
        key: "created_at",
        header: "Time",
        render: (log) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium">{timeAgo(log.created_at)}</span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(log.created_at).toLocaleString()}
            </span>
          </div>
        ),
      },
      {
        key: "action",
        header: "Action",
        render: (log) => {
          const style = ACTION_STYLES[log.action];
          const ActionIcon = style?.icon || CheckCircle2;
          return (
            <div className="flex items-center gap-2">
              <ActionIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <Badge
                variant="outline"
                className={cn("text-[10px] font-medium", style?.bg)}
              >
                {ACTION_LABELS[log.action] || log.action}
              </Badge>
            </div>
          );
        },
      },
      {
        key: "scope",
        header: "Scope",
        render: (log) => (
          <div className="flex flex-col">
            <span className="text-sm capitalize">{log.scope.replace(/_/g, " ")}</span>
            <span className="text-[11px] font-mono text-muted-foreground">
              {log.scope_id.slice(0, 12)}
            </span>
          </div>
        ),
      },
      {
        key: "source_entries",
        header: "Entries",
        render: (log) => (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium tabular-nums">
              {log.source_entry_ids.length}
            </span>
            <span className="text-xs text-muted-foreground">source</span>
          </div>
        ),
      },
      {
        key: "result",
        header: "Result",
        render: (log) =>
          log.result_entry_id ? (
            <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              {log.result_entry_id.slice(0, 10)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50">--</span>
          ),
      },
      {
        key: "details",
        header: "Reason",
        render: (log) => {
          const reason = (log.details as Record<string, string>).reason;
          return reason ? (
            <span className="text-xs text-muted-foreground truncate max-w-[220px] block" title={reason}>
              {reason}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50">--</span>
          );
        },
      },
    ],
    [],
  );

  const totalPages = Math.ceil(consolTotal / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header row: stats + trigger button */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Summary stats */}
        <Card className="flex-1">
          <CardContent className="pt-5 pb-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatMini
                icon={Clock}
                label="Last Run"
                value={lastConsolidation}
                color="text-primary"
              />
              <StatMini
                icon={Layers}
                label="Total Logs"
                value={consolTotal.toLocaleString()}
                color="text-info"
              />
              <StatMini
                icon={TrendingDown}
                label="Decayed (last)"
                value={globalStats?.entries_decayed_last_cycle ?? 0}
                color="text-warning"
              />
              <StatMini
                icon={Timer}
                label="Schedule"
                value="Every 6h"
                color="text-success"
              />
            </div>
          </CardContent>
        </Card>

        {/* Trigger card */}
        <Card className="lg:w-[280px] shrink-0">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold">Manual Trigger</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Run decay, cleanup &amp; consolidation now
                </p>
              </div>
              <Button
                onClick={handleTrigger}
                disabled={consolTriggering}
                className="w-full"
                size="sm"
              >
                {consolTriggering ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-2" />
                    Run Consolidation
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trigger result banner */}
      {consolTriggerResult && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-success">Consolidation completed</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  <span className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{consolTriggerResult.decayed}</strong> decayed
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{consolTriggerResult.invalidated}</strong> invalidated
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{consolTriggerResult.scopes_processed}</strong> scopes
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{consolTriggerResult.logs_cleaned}</strong> logs cleaned
                  </span>
                  <span className="text-xs text-muted-foreground">
                    in <strong className="text-foreground">{consolTriggerResult.duration_ms}ms</strong>
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={clearTriggerResult}
              >
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {consolTriggerError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">Consolidation failed</p>
                <p className="text-xs text-muted-foreground mt-0.5">{consolTriggerError}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={clearTriggerResult}
              >
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action distribution pills (when we have logs) */}
      {consolTotal > 0 && Object.keys(actionCounts).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(actionCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([action, count]) => {
              const style = ACTION_STYLES[action];
              return (
                <Badge
                  key={action}
                  variant="outline"
                  className={cn("text-[11px] gap-1 cursor-default", style?.bg)}
                >
                  {ACTION_LABELS[action] || action}
                  <span className="font-bold tabular-nums">{count}</span>
                </Badge>
              );
            })}
        </div>
      )}

      {/* Toolbar: filter + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <Separator className="my-1" />
              <SelectItem value="decayed">Decayed</SelectItem>
              <SelectItem value="merged">Merged</SelectItem>
              <SelectItem value="invalidated">Invalidated</SelectItem>
              <SelectItem value="manual_invalidate">Manual Invalidate</SelectItem>
              <SelectItem value="promoted">Promoted</SelectItem>
              <SelectItem value="kept">Kept</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} className="gap-1.5 text-xs">
          <RefreshCw className={cn("h-3.5 w-3.5", consolLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Log table */}
      <ResourceTable<ConsolidationLog>
        items={filteredLogs}
        columns={columns}
        pagination={{
          page: consolPage,
          totalPages,
          totalItems: consolTotal,
        }}
        onPageChange={handlePageChange}
        isLoading={consolLoading}
        keyExtractor={(log) => log.id}
        emptyState={
          <EmptyState
            icon={Clock}
            title={consolError ? "Failed to load logs" : "No consolidation logs yet"}
            description={
              consolError
                ? consolError
                : "Consolidation runs every 6 hours when fact extraction is enabled. You can also trigger it manually above."
            }
            action={
              !consolError ? (
                <Button size="sm" onClick={handleTrigger} disabled={consolTriggering}>
                  {consolTriggering ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-2" />
                      Run First Consolidation
                    </>
                  )}
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
