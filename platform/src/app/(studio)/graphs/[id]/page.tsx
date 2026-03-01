"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { GitFork, Save, Trash2 } from "lucide-react";
import { Button, Badge } from "@modularmind/ui";
import type { Node, Edge } from "@xyflow/react";
import { DetailHeader } from "@/components/studio/shared/DetailHeader";
import type { PlatformGraph } from "@/stores/graphs";

// Dynamic import to avoid SSR issues with ReactFlow
const GraphCanvas = dynamic(
  () => import("@/components/studio/graphs/GraphCanvas").then((m) => ({ default: m.GraphCanvas })),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> },
);

export default function GraphDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [graph, setGraph] = useState<PlatformGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/graphs/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Graph not found");
        return res.json();
      })
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

        const res = await fetch(`/api/graphs/${graph.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: graphNodes,
            edges: graphEdges,
          }),
        });
        if (!res.ok) throw new Error("Failed to save");
        const updated = await res.json();
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
      const res = await fetch(`/api/graphs/${graph.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/graphs");
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

  const nodeCount = Array.isArray(graph.nodes) ? graph.nodes.length : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <DetailHeader
        backHref="/graphs"
        backLabel="Graphs"
        title={graph.name}
        badges={
          <>
            <Badge variant="secondary">v{graph.version}</Badge>
            <Badge variant="secondary">{nodeCount} nodes</Badge>
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
