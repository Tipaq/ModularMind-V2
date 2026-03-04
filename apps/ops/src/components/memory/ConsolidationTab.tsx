import { useEffect, useMemo, useCallback } from "react";
import { Clock } from "lucide-react";
import { Badge, cn } from "@modularmind/ui";
import { useMemoryStore, type ConsolidationLog } from "../../stores/memory";
import { ResourceTable } from "../shared/ResourceTable";
import { EmptyState } from "../shared/EmptyState";
import type { ResourceColumn } from "../../lib/types";

const PAGE_SIZE = 20;

const ACTION_STYLES: Record<string, string> = {
  merged: "bg-info/15 text-info border-info/30",
  invalidated: "bg-destructive/15 text-destructive border-destructive/30",
  manual_invalidate: "bg-warning/15 text-warning border-warning/30",
  promoted: "bg-success/15 text-success border-success/30",
  kept: "bg-muted text-muted-foreground",
};

export function ConsolidationTab() {
  const { consolLogs, consolTotal, consolPage, consolLoading, consolError, fetchConsolidationLogs } =
    useMemoryStore();

  useEffect(() => {
    fetchConsolidationLogs(1);
  }, [fetchConsolidationLogs]);

  const handlePageChange = useCallback(
    (page: number) => {
      fetchConsolidationLogs(page);
    },
    [fetchConsolidationLogs],
  );

  const columns: ResourceColumn<ConsolidationLog>[] = useMemo(
    () => [
      {
        key: "created_at",
        header: "Date",
        render: (log) => (
          <span className="text-sm">
            {new Date(log.created_at).toLocaleString()}
          </span>
        ),
      },
      {
        key: "action",
        header: "Action",
        render: (log) => (
          <Badge
            variant="outline"
            className={cn("text-[10px] font-medium capitalize", ACTION_STYLES[log.action])}
          >
            {log.action.replace("_", " ")}
          </Badge>
        ),
      },
      {
        key: "scope",
        header: "Scope",
        render: (log) => (
          <span className="text-sm text-muted-foreground capitalize">
            {log.scope.replace("_", " ")} / {log.scope_id.slice(0, 8)}
          </span>
        ),
      },
      {
        key: "source_entries",
        header: "Source Entries",
        render: (log) => (
          <span className="text-sm tabular-nums">{log.source_entry_ids.length}</span>
        ),
      },
      {
        key: "result",
        header: "Result",
        render: (log) =>
          log.result_entry_id ? (
            <span className="text-xs font-mono text-muted-foreground">
              {log.result_entry_id.slice(0, 8)}...
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        key: "details",
        header: "Details",
        render: (log) => {
          const reason = (log.details as Record<string, string>).reason;
          return reason ? (
            <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
              {reason}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
    ],
    [],
  );

  const totalPages = Math.ceil(consolTotal / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <ResourceTable<ConsolidationLog>
        items={consolLogs}
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
                : "Consolidation runs every 6 hours when fact extraction is enabled."
            }
          />
        }
      />
    </div>
  );
}
