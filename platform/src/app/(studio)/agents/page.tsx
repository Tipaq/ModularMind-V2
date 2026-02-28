"use client";

import { useEffect, useState } from "react";
import { Bot, Plus, Trash2, ArrowUpCircle } from "lucide-react";
import Link from "next/link";

type Agent = {
  id: string;
  name: string;
  description: string;
  model: string;
  provider: string;
  channel: string;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

const CHANNEL_COLORS: Record<string, string> = {
  dev: "bg-yellow-100 text-yellow-700",
  beta: "bg-blue-100 text-blue-700",
  stable: "bg-green-100 text-green-700",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", model: "", provider: "ollama" });
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/agents");
    if (res.ok) setAgents(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ name: "", description: "", model: "", provider: "ollama" });
      setShowCreate(false);
      load();
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this agent?")) return;
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    load();
  }

  async function handlePromote(id: string, channel: string) {
    const next = channel === "dev" ? "beta" : channel === "beta" ? "stable" : null;
    if (!next) return;
    if (!confirm(`Promote to ${next}?`)) return;
    await fetch(`/api/agents/${id}/promote`, {
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
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground">Create and manage AI agents</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Agent
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
              <label className="mb-1 block text-sm font-medium">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Model</label>
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="llama3.2"
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
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Agent"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Cancel
            </button>
          </div>
        </form>
      )}

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-muted-foreground">
          <Bot className="mb-2 h-10 w-10" />
          <p>No agents yet</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between">
                <Link href={`/agents/${agent.id}`} className="flex items-center gap-2 hover:underline">
                  <Bot className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">{agent.name}</h3>
                </Link>
                <div className="flex gap-1">
                  {agent.channel !== "stable" && (
                    <button
                      onClick={() => handlePromote(agent.id, agent.channel)}
                      className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      title={`Promote to ${agent.channel === "dev" ? "beta" : "stable"}`}
                    >
                      <ArrowUpCircle className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(agent.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {agent.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_COLORS[agent.channel] ?? ""}`}>
                  {agent.channel}
                </span>
                <span className="text-xs text-muted-foreground">
                  {agent.provider}/{agent.model}
                </span>
                <span className="text-xs text-muted-foreground">v{agent.version}</span>
              </div>
              {agent.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {agent.tags.map((tag) => (
                    <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
