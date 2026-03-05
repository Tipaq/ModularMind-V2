import { useEffect, useMemo, useCallback } from "react";
import { Ban, RefreshCw, Database } from "lucide-react";
import {
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Label,
} from "@modularmind/ui";
import { useMemoryStore, type MemoryEntry } from "../../stores/memory";
import { EmptyState } from "../shared/EmptyState";
import { ResourceTable } from "../shared/ResourceTable";
import { MemoryTypeBadge } from "./MemoryTypeBadge";
import { ImportanceBar } from "./ImportanceBar";
import type { ResourceColumn } from "@modularmind/ui";

const PAGE_SIZE = 20;

export function MemoryExplorerTab() {
  const {
    entries,
    entriesTotal,
    entriesPage,
    entriesLoading,
    filters,
    memoryUsers,
    fetchEntries,
    fetchMemoryUsers,
    invalidateEntry,
    setFilters,
  } = useMemoryStore();

  const { entriesError } = useMemoryStore();

  useEffect(() => {
    fetchMemoryUsers();
    fetchEntries(1);
  }, [fetchEntries, fetchMemoryUsers]);

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      setFilters({ [key]: value });
      // Refetch with new filters after state update
      setTimeout(() => {
        useMemoryStore.getState().fetchEntries(1);
      }, 0);
    },
    [setFilters],
  );

  const handleToggleExpired = useCallback(
    (checked: boolean) => {
      setFilters({ include_expired: checked });
      setTimeout(() => {
        useMemoryStore.getState().fetchEntries(1);
      }, 0);
    },
    [setFilters],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      fetchEntries(page);
    },
    [fetchEntries],
  );

  const handleRefresh = useCallback(() => {
    fetchEntries(entriesPage);
  }, [fetchEntries, entriesPage]);

  const columns: ResourceColumn<MemoryEntry>[] = useMemo(
    () => [
      {
        key: "content",
        header: "Content",
        render: (e) => (
          <p className="text-sm max-w-md truncate" title={e.content}>
            {e.content}
          </p>
        ),
      },
      {
        key: "memory_type",
        header: "Type",
        render: (e) => <MemoryTypeBadge type={e.memory_type} />,
      },
      {
        key: "scope",
        header: "Scope",
        render: (e) => (
          <span className="text-sm text-muted-foreground capitalize">
            {e.scope.replace("_", " ")}
          </span>
        ),
      },
      {
        key: "importance",
        header: "Importance",
        render: (e) => <ImportanceBar value={e.importance} />,
      },
      {
        key: "access_count",
        header: "Accesses",
        render: (e) => (
          <span className="text-sm tabular-nums">{e.access_count}</span>
        ),
      },
      {
        key: "created_at",
        header: "Created",
        render: (e) => (
          <span className="text-xs text-muted-foreground">
            {new Date(e.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (e) =>
          e.expired_at ? (
            <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">
              Expired
            </Badge>
          ) : (
            <Badge variant="outline" className="text-success border-success/30 text-[10px]">
              Active
            </Badge>
          ),
      },
    ],
    [],
  );

  const totalPages = Math.ceil(entriesTotal / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.scope || "all"}
          onValueChange={(v) => handleFilterChange("scope", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Scopes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="user_profile">User Profile</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="cross_conversation">Cross Conv.</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.memory_type || "all"}
          onValueChange={(v) => handleFilterChange("memory_type", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="episodic">Episodic</SelectItem>
            <SelectItem value="semantic">Semantic</SelectItem>
            <SelectItem value="procedural">Procedural</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.tier || "all"}
          onValueChange={(v) => handleFilterChange("tier", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="vector">Vector</SelectItem>
            <SelectItem value="structured">Structured</SelectItem>
          </SelectContent>
        </Select>

        {memoryUsers.length > 0 && (
          <Select
            value={filters.user_id || "all"}
            onValueChange={(v) => handleFilterChange("user_id", v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {memoryUsers.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.user_id.slice(0, 8)}... ({u.memory_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Switch
            id="include-expired"
            checked={filters.include_expired}
            onCheckedChange={handleToggleExpired}
          />
          <Label htmlFor="include-expired" className="text-sm text-muted-foreground">
            Show expired
          </Label>
        </div>

        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <ResourceTable<MemoryEntry>
        items={entries}
        columns={columns}
        pagination={{
          page: entriesPage,
          totalPages,
          totalItems: entriesTotal,
        }}
        onPageChange={handlePageChange}
        isLoading={entriesLoading}
        keyExtractor={(e) => e.id}
        emptyState={
          <EmptyState
            icon={Database}
            title={entriesError ? "Failed to load memories" : "No memory entries found"}
            description={
              entriesError
                ? entriesError
                : "No entries match your filters, or no memories have been created yet."
            }
          />
        }
        rowActions={(e) =>
          !e.expired_at ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              title="Invalidate entry"
              onClick={() => invalidateEntry(e.id)}
            >
              <Ban className="h-4 w-4" />
            </Button>
          ) : null
        }
      />
    </div>
  );
}
