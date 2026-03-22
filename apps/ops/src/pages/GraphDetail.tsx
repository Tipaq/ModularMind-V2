import { lazy, Suspense, useEffect, useCallback, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, GitFork, Save, Trash2, RefreshCw } from "lucide-react";
import { Badge, Button } from "@modularmind/ui";
import type { Node, Edge } from "@xyflow/react";
import type { NodeInput, EdgeInput } from "@modularmind/api-client";
import { useGraphsStore } from "../stores/graphs";

const GraphCanvas = lazy(() =>
  import("../components/graphs/GraphCanvas").then((m) => ({ default: m.GraphCanvas })),
);

function flowNodesToInput(nodes: Node[]): NodeInput[] {
  return nodes.map((n) => ({
    id: n.id,
    type: String(n.data?.type ?? "agent"),
    data: {
      ...(n.data as Record<string, unknown>),
      position: n.position,
    },
  }));
}

function flowEdgesToInput(edges: Edge[]): EdgeInput[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: (e.data as Record<string, unknown>) ?? undefined,
  }));
}

export default function GraphDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const {
    selectedGraph: graph,
    loading,
    fetchGraph,
    updateGraph,
    deleteGraph,
  } = useGraphsStore();

  useEffect(() => {
    if (id) fetchGraph(id);
  }, [id, fetchGraph]);

  const handleSave = useCallback(
    async (nodes: Node[], edges: Edge[]) => {
      if (!id) return;
      setSaving(true);
      try {
        await updateGraph(id, {
          nodes: flowNodesToInput(nodes),
          edges: flowEdgesToInput(edges),
        });
      } finally {
        setSaving(false);
      }
    },
    [id, updateGraph],
  );

  const handleDelete = useCallback(async () => {
    if (!graph || !confirm(`Delete "${graph.name}"?`)) return;
    await deleteGraph(graph.id);
    navigate("/graphs");
  }, [graph, deleteGraph, navigate]);

  if (loading || !graph) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="border-b border-border px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/graphs"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Graphs
            </Link>
            <div className="h-4 w-px bg-border" />
            <GitFork className="h-5 w-5 text-warning" />
            <h1 className="text-lg font-semibold">{graph.name}</h1>
            <Badge variant="outline" className="font-mono text-xs">
              v{graph.version}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const canvas = document.querySelector("[data-graph-canvas]");
                if (canvas) canvas.dispatchEvent(new CustomEvent("graph:save"));
              }}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <GraphCanvas graph={graph} onSave={handleSave} saving={saving} />
        </Suspense>
      </div>
    </div>
  );
}
