"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

type Graph = {
  id: string;
  name: string;
  description: string;
  nodes: unknown[];
  edges: unknown[];
  channel: string;
  version: number;
};

export default function GraphEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nodesJson, setNodesJson] = useState("[]");
  const [edgesJson, setEdgesJson] = useState("[]");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/graphs/${id}`);
      if (!res.ok) { router.push("/graphs"); return; }
      const data = await res.json();
      setGraph(data);
      setNodesJson(JSON.stringify(data.nodes, null, 2));
      setEdgesJson(JSON.stringify(data.edges, null, 2));
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!graph) return;
    setSaving(true);

    let nodes: unknown[], edges: unknown[];
    try {
      nodes = JSON.parse(nodesJson);
      edges = JSON.parse(edgesJson);
    } catch {
      alert("Invalid JSON in nodes or edges");
      setSaving(false);
      return;
    }

    const res = await fetch(`/api/graphs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: graph.name,
        description: graph.description,
        nodes,
        edges,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setGraph(updated);
    }
    setSaving(false);
  }

  if (loading || !graph) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/graphs" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to graphs
        </Link>
        <h1 className="text-2xl font-bold">{graph.name}</h1>
        <p className="text-sm text-muted-foreground">
          {graph.channel} / v{graph.version}
        </p>
      </div>

      <form onSubmit={handleSave} className="max-w-3xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              value={graph.name}
              onChange={(e) => setGraph({ ...graph, name: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <input
              value={graph.description}
              onChange={(e) => setGraph({ ...graph, description: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Nodes (JSON)</label>
          <textarea
            value={nodesJson}
            onChange={(e) => setNodesJson(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            rows={10}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Edges (JSON)</label>
          <textarea
            value={edgesJson}
            onChange={(e) => setEdgesJson(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            rows={8}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
