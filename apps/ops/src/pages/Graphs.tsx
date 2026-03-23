import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GitFork, Plus, Copy, Trash2 } from "lucide-react";
import {
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  PageHeader,
  EmptyState,
  ResourceTable,
  ResourceFilters,
  formatModelName,
} from "@modularmind/ui";
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";
import type { GraphListItem } from "@modularmind/api-client";
import { useGraphsStore } from "../stores/graphs";
import { CreateGraphDialog } from "../components/graphs/CreateGraphDialog";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search graphs..." },
];

export default function Graphs() {
  const navigate = useNavigate();
  const {
    graphs, loading, page, totalPages, total,
    fetchGraphs, deleteGraph, duplicateGraph,
  } = useGraphsStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    fetchGraphs(1);
  }, [fetchGraphs]);

  const filtered = useMemo(() => {
    if (!filterValues.search) return graphs;
    const searchTerm = filterValues.search.toLowerCase();
    return graphs.filter(
      (g) => g.name.toLowerCase().includes(searchTerm) || g.description?.toLowerCase().includes(searchTerm),
    );
  }, [graphs, filterValues.search]);

  const handleRowClick = useCallback(
    (graph: GraphListItem) => navigate(`/graphs/${graph.id}`),
    [navigate],
  );

  const handleDelete = useCallback(
    async (graph: GraphListItem) => {
      if (!confirm(`Delete "${graph.name}"?`)) return;
      await deleteGraph(graph.id);
    },
    [deleteGraph],
  );

  const columns: ResourceColumn<GraphListItem>[] = [
    {
      key: "name",
      header: "Graph",
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
      key: "node_count",
      header: "Nodes",
      className: "hidden md:table-cell",
      render: (g) => (
        <span className="text-xs text-muted-foreground">{g.node_count}</span>
      ),
    },
    {
      key: "edge_count",
      header: "Edges",
      className: "hidden md:table-cell",
      render: (g) => (
        <span className="text-xs text-muted-foreground">{g.edge_count}</span>
      ),
    },
    {
      key: "models",
      header: "Models",
      className: "hidden lg:table-cell",
      render: (g) => (
        <div className="flex flex-wrap gap-1">
          {g.models.length > 0
            ? g.models.map((model) => (
                <Badge key={model} variant="outline" className="text-[10px] py-0 px-1.5">
                  {formatModelName(model)}
                </Badge>
              ))
            : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: "version",
      header: "Version",
      className: "hidden lg:table-cell",
      render: (g) => (
        <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5">
          v{g.version}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={GitFork}
        gradient="from-warning to-warning/70"
        title="Graphs"
        description="Visual agent workflows with nodes and edges"
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
        onChange={(key, value) => setFilterValues((prev) => ({ ...prev, [key]: value }))}
      />

      <ResourceTable<GraphListItem>
        items={filtered}
        columns={columns}
        pagination={{ page, totalPages, totalItems: total }}
        onPageChange={(p) => fetchGraphs(p)}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={GitFork}
            title="No graphs yet"
            description="Create your first graph to get started."
            action={
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Graph
              </Button>
            }
          />
        }
        keyExtractor={(g) => g.id}
        rowActions={(g) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">...</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => duplicateGraph(g.id)}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDelete(g)} className="text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <CreateGraphDialog
        isOpen={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={(graph) => navigate(`/graphs/${graph.id}`)}
      />
    </div>
  );
}
