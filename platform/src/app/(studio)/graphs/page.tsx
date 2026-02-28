"use client";

import { useEffect, useState } from "react";
import { GitFork, Plus, Trash2, ArrowUpCircle } from "lucide-react";
import Link from "next/link";

type Graph = {
  id: string;
  name: string;
  description: string;
  nodes: unknown[];
  edges: unknown[];
  channel: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const CHANNEL_COLORS: Record<string, string> = {
  dev: "bg-yellow-100 text-yellow-700",
  beta: "bg-blue-100 text-blue-700",
  stable: "bg-green-100 text-green-700",
};

export default function GraphsPage() {
  const [graphs, setGraphs] = useState<Graph[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/graphs");
    if (res.ok) setGraphs(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/graphs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ name: "", description: "" });
      setShowCreate(false);
      load();
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this graph?")) return;
    await fetch(`/api/graphs/${id}`, { method: "DELETE" });
    load();
  }

  async function handlePromote(id: string, channel: string) {
    const next = channel === "dev" ? "beta" : channel === "beta" ? "stable" : null;
    if (!next) return;
    if (!confirm(`Promote to ${next}?`)) return;
    await fetch(`/api/graphs/${id}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: next }),
    });
    load();
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Graphs</h1>
          <p className="text-sm text-muted-foreground">Visual agent workflow graphs</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Graph
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Graph"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Cancel
            </button>
          </div>
        </form>
      )}

      {graphs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-muted-foreground">
          <GitFork className="mb-2 h-10 w-10" />
          <p>No graphs yet</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {graphs.map((graph) => (
            <div key={graph.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between">
                <Link href={`/graphs/${graph.id}`} className="flex items-center gap-2 hover:underline">
                  <GitFork className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">{graph.name}</h3>
                </Link>
                <div className="flex gap-1">
                  {graph.channel !== "stable" && (
                    <button
                      onClick={() => handlePromote(graph.id, graph.channel)}
                      className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    >
                      <ArrowUpCircle className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(graph.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {graph.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{graph.description}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_COLORS[graph.channel] ?? ""}`}>
                  {graph.channel}
                </span>
                <span className="text-xs text-muted-foreground">
                  {Array.isArray(graph.nodes) ? graph.nodes.length : 0} nodes
                </span>
                <span className="text-xs text-muted-foreground">v{graph.version}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
