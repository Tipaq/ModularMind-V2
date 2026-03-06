"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useTableSort } from "@/hooks/useTableSort";
import { useRouter } from "next/navigation";
import { Server, Trash2, Key } from "lucide-react";
import { EngineStatusBadge as StatusBadge } from "@/components/EngineStatusBadge";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  PageHeader,
  relativeTime,
  EmptyState,
  ResourceTable,
  ResourceFilters,
} from "@modularmind/ui";
import { useEnginesStore, type PlatformEngineListItem } from "@/stores/engines";
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search engines..." },
  {
    key: "status",
    label: "Status",
    type: "select",
    placeholder: "All statuses",
    options: [
      { value: "registered", label: "Registered" },
      { value: "synced", label: "Synced" },
      { value: "offline", label: "Offline" },
    ],
  },
];

export default function EnginesPage() {
  const router = useRouter();
  const {
    engines,
    loading,
    page,
    totalPages,
    total,
    fetchEngines,
    deleteEngine,
    setStatusFilter,
  } = useEnginesStore();

  const onFilterChange = useCallback(
    (key: string, value: string) => {
      if (key === "status") {
        setStatusFilter(value);
        fetchEngines(1);
      }
    },
    [setStatusFilter, fetchEngines],
  );
  const { filterValues, sortState, handleColumnSort, handleFilterChange } = useTableSort(onFilterChange);

  useEffect(() => {
    fetchEngines(1);
  }, [fetchEngines]);

  const filtered = useMemo(() => {
    let result = engines;

    if (filterValues.search) {
      const s = filterValues.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(s) ||
          e.client.name.toLowerCase().includes(s),
      );
    }

    if (filterValues.sort) {
      result = [...result].sort((a, b) => {
        switch (filterValues.sort) {
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "name_desc":
            return b.name.localeCompare(a.name);
          case "status_asc":
            return a.status.localeCompare(b.status);
          case "status_desc":
            return b.status.localeCompare(a.status);
          default:
            return 0;
        }
      });
    }

    return result;
  }, [engines, filterValues]);

  const handleDelete = useCallback(
    async (engine: PlatformEngineListItem) => {
      if (!confirm(`Delete engine "${engine.name}"?`)) return;
      try {
        await deleteEngine(engine.id);
      } catch {
        // Error handled in store
      }
    },
    [deleteEngine],
  );

  const handleCopyKey = useCallback((apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
  }, []);

  const columns: ResourceColumn<PlatformEngineListItem>[] = [
    {
      key: "name",
      header: "Engine",
      sortKey: "name",
      render: (e) => (
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-sm">{e.name}</span>
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      className: "hidden md:table-cell",
      render: (e) => (
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            router.push(`/clients/${e.client.id}`);
          }}
          className="text-sm text-primary hover:underline"
        >
          {e.client.name}
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: "lastSeen",
      header: "Last Seen",
      className: "hidden md:table-cell",
      render: (e) => (
        <span className="text-sm text-muted-foreground">
          {e.lastSeen ? relativeTime(e.lastSeen) : "Never"}
        </span>
      ),
    },
    {
      key: "version",
      header: "Version",
      className: "hidden lg:table-cell",
      render: (e) => (
        <span className="text-sm font-mono">v{e.version}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Server}
        gradient="from-info to-info/70"
        title="Engines"
        description="Registered engine instances and their sync status"
      />

      <ResourceFilters
        filters={filterConfigs}
        values={filterValues}
        onChange={handleFilterChange}
      />

      <ResourceTable<PlatformEngineListItem>
        items={filtered}
        columns={columns}
        pagination={{
          page,
          totalPages,
          totalItems: total,
        }}
        onPageChange={(p) => fetchEngines(p)}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={Server}
            title="No engines registered"
            description="Create a client to generate an engine API key."
          />
        }
        keyExtractor={(e) => e.id}
        sortState={sortState}
        onSort={handleColumnSort}
        rowActions={(e) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleCopyKey(e.apiKey)}>
                <Key className="mr-2 h-3.5 w-3.5" />
                Copy API Key
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(e)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </div>
  );
}
