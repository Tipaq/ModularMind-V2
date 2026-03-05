"use client";

import type { ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Button } from "@modularmind/ui";
import type { ResourceColumn, PaginationState, SortState } from "@modularmind/ui";

interface ResourceTableProps<T> {
  items: T[];
  columns: ResourceColumn<T>[];
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  onRowClick?: (item: T) => void;
  rowActions?: (item: T) => ReactNode;
  isLoading?: boolean;
  emptyState?: ReactNode;
  keyExtractor: (item: T) => string;
  sortState?: SortState | null;
  onSort?: (sortKey: string) => void;
}

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr className="border-b last:border-0">
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

function SortIcon({ sortKey, sortState }: { sortKey: string; sortState?: SortState | null }) {
  if (sortState?.key === sortKey) {
    return sortState.direction === "asc" ? (
      <ChevronUp className="h-3.5 w-3.5" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5" />
    );
  }
  return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
}

export function ResourceTable<T>({
  items,
  columns,
  pagination,
  onPageChange,
  onRowClick,
  rowActions,
  isLoading,
  emptyState,
  keyExtractor,
  sortState,
  onSort,
}: ResourceTableProps<T>) {
  const totalCols = columns.length + (rowActions ? 1 : 0);

  if (isLoading) {
    return (
      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 ${col.className || ""}`}
                >
                  {col.header}
                </th>
              ))}
              {rowActions && (
                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 w-[100px]">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} colCount={totalCols} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => {
                const thClass = `text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 ${col.className || ""}`;
                if (col.sortKey && onSort) {
                  return (
                    <th key={col.key} className={thClass}>
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => onSort(col.sortKey!)}
                      >
                        {col.header}
                        <SortIcon sortKey={col.sortKey} sortState={sortState} />
                      </button>
                    </th>
                  );
                }
                return (
                  <th key={col.key} className={thClass}>
                    {col.header}
                  </th>
                );
              })}
              {rowActions && (
                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 w-[100px]">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
                    {col.render(item)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {rowActions(item)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} items)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
