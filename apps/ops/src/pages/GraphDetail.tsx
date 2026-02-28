import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GitFork, Save, Trash2 } from "lucide-react";
import { Button, Badge } from "@modularmind/ui";
import type { Graph } from "@modularmind/api-client";
import type { Node, Edge } from "@xyflow/react";
import { DetailHeader } from "../components/shared/DetailHeader";
import { GraphCanvas } from "../components/graphs/GraphCanvas";
import { api } from "../lib/api";

export default function GraphDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<Graph>(`/graphs/${id}`)
      .then(setGraph)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = useCallback(
    async (nodes: Node[], edges: Edge[]) => {
      if (!graph) return;
      setSaving(true);
      try {
        const graphNodes = nodes.map((n) => ({
          id: n.id,
          type: (n.data?.type as string) || "agent",
          position: n.position,
          data: { ...(n.data as Record<string, unknown>) },
        }));
        // Remove internal fields from data
        for (const node of graphNodes) {
          delete node.data.isEntryNode;
          delete node.data.executionStatus;
          delete node.data.executionDurationMs;
        }

        const graphEdges = edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          source_handle: e.sourceHandle || null,
          target_handle: e.targetHandle || null,
          data: (e.data as Record<string, unknown>) || {},
        }));

        const updated = await api.patch<Graph>(`/graphs/${graph.id}`, {
          nodes: graphNodes,
          edges: graphEdges,
          version: graph.version,
        });
        setGraph(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [graph],
  );

  const handleDelete = async () => {
    if (!graph || !confirm("Delete this graph? This action cannot be undone.")) return;
    try {
      await api.delete(`/graphs/${graph.id}`);
      navigate("/graphs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !graph) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {error || "Graph not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <DetailHeader
        backHref="/graphs"
        backLabel="Graphs"
        title={graph.name}
        badges={
          <>
            <Badge variant="secondary">v{graph.version}</Badge>
            <Badge variant="secondary">{graph.nodes.length} nodes</Badge>
          </>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <Button size="sm" onClick={() => handleSave([], [])} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      />

      <div className="flex-1 min-h-0">
        <GraphCanvas graph={graph} onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}
