"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Plus, Copy, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Input,
  PageHeader,
} from "@modularmind/ui";
import { EmptyState } from "@/components/studio/shared/EmptyState";
import { ResourceTable } from "@/components/studio/shared/ResourceTable";
import { ResourceFilters } from "@/components/studio/shared/ResourceFilters";
import { useGraphsStore, type PlatformGraphListItem } from "@/stores/graphs";
import type { ResourceColumn, ResourceFilterConfig, SortState } from "@/lib/types";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search graphs..." },
];

export default function GraphsPage() {
  const router = useRouter();
  const {
    graphs,
    loading,
    page,
    totalPages,
    total,
    fetchGraphs,
    createGraph,
    deleteGraph,
    duplicateGraph,
  } = useGraphsStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchGraphs(1);
  }, [fetchGraphs]);

  const filtered = useMemo(() => {
    let result = graphs;

    if (filterValues.search) {
      const s = filterValues.search.toLowerCase();
      result = result.filter(
        (g) =>
          g.name.toLowerCase().includes(s) ||
          (g.description?.toLowerCase().includes(s) ?? false),
      );
    }

    if (filterValues.sort) {
      result = [...result].sort((a, b) => {
        switch (filterValues.sort) {
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "name_desc":
            return b.name.localeCompare(a.name);
          case "nodes_desc":
            return b.node_count - a.node_count;
          case "nodes_asc":
            return a.node_count - b.node_count;
          default:
            return 0;
        }
      });
    }

    return result;
  }, [graphs, filterValues]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const sortState = useMemo((): SortState | null => {
    const s = filterValues.sort;
    if (!s) return null;
    if (s.endsWith("_asc")) return { key: s.replace(/_asc$/, ""), direction: "asc" };
    if (s.endsWith("_desc")) return { key: s.replace(/_desc$/, ""), direction: "desc" };
    return { key: s, direction: "asc" };
  }, [filterValues.sort]);

  const handleColumnSort = useCallback((sortKey: string) => {
    setFilterValues((prev) => {
      const current = prev.sort || "";
      if (current === `${sortKey}_asc` || current === sortKey) {
        return { ...prev, sort: `${sortKey}_desc` };
      }
      if (current === `${sortKey}_desc`) {
        return { ...prev, sort: "" };
      }
      return { ...prev, sort: `${sortKey}_asc` };
    });
  }, []);

  const handleRowClick = useCallback(
    (graph: PlatformGraphListItem) => {
      router.push(`/graphs/${graph.id}`);
    },
    [router],
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const graph = await createGraph({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setShowCreateDialog(false);
      setNewName("");
      setNewDesc("");
      router.push(`/graphs/${graph.id}`);
    } finally {
      setCreating(false);
    }
  }, [newName, newDesc, createGraph, router]);

  const handleDelete = useCallback(
    async (graph: PlatformGraphListItem) => {
      if (!confirm(`Are you sure you want to delete "${graph.name}"?`)) return;
      await deleteGraph(graph.id);
    },
    [deleteGraph],
  );

  const handleDuplicate = useCallback(
    async (graph: PlatformGraphListItem) => {
      await duplicateGraph(graph.id);
    },
    [duplicateGraph],
  );

  const columns: ResourceColumn<PlatformGraphListItem>[] = [
    {
      key: "name",
      header: "Graph",
      sortKey: "name",
      render: (g) => (
        <div>
          <p className="font-medium text-sm">{g.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {g.description || "No description"}
          </p>
        </div>
      ),
    },
    {
      key: "nodes",
      header: "Nodes",
      sortKey: "nodes",
      className: "hidden md:table-cell",
      render: (g) => <span className="text-sm">{g.node_count}</span>,
    },
    {
      key: "edges",
      header: "Edges",
      className: "hidden md:table-cell",
      render: (g) => <span className="text-sm">{g.edge_count}</span>,
    },
    {
      key: "version",
      header: "Version",
      className: "hidden lg:table-cell",
      render: (g) => <span className="text-sm font-mono">v{g.version}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={GitBranch}
        gradient="from-warning to-warning/70"
        title="Graphs"
        description="Visual workflow editor for agent orchestration"
        actions={
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Graph
          </Button>
        }
      />

      <ResourceFilters
        filters={filterConfigs}
        values={filterValues}
        onChange={handleFilterChange}
      />

      <ResourceTable<PlatformGraphListItem>
        items={filtered}
        columns={columns}
        pagination={{
          page,
          totalPages,
          totalItems: total,
        }}
        onPageChange={(p) => fetchGraphs(p)}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={GitBranch}
            title="No graphs yet"
            description="Create your first workflow graph to get started."
            action={
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Graph
              </Button>
            }
          />
        }
        keyExtractor={(g) => g.id}
        sortState={sortState}
        onSort={handleColumnSort}
        rowActions={(g) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDuplicate(g)}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(g)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Graph</DialogTitle>
            <DialogDescription>
              Create a new workflow graph for agent orchestration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Workflow"
              autoFocus
            />
            <Input
              label="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Describe this workflow..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
