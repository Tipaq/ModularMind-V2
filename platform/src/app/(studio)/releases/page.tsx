"use client";

import { useEffect, useState } from "react";
import { Rocket, Bot, GitFork, ArrowRight } from "lucide-react";

type Item = {
  id: string;
  name: string;
  channel: string;
  version: number;
  updatedAt: string;
  type: "agent" | "graph";
};

const CHANNEL_COLORS: Record<string, string> = {
  dev: "bg-yellow-100 text-yellow-700",
  beta: "bg-blue-100 text-blue-700",
  stable: "bg-green-100 text-green-700",
};

export default function ReleasesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "dev" | "beta" | "stable">("all");

  useEffect(() => {
    async function load() {
      const [agentsRes, graphsRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/graphs"),
      ]);
      const agents = agentsRes.ok ? await agentsRes.json() : [];
      const graphs = graphsRes.ok ? await graphsRes.json() : [];

      const all: Item[] = [
        ...agents.map((a: Item) => ({ ...a, type: "agent" as const })),
        ...graphs.map((g: Item) => ({ ...g, type: "graph" as const })),
      ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      setItems(all);
      setLoading(false);
    }
    load();
  }, []);

  async function promote(type: string, id: string, currentChannel: string) {
    const next = currentChannel === "dev" ? "beta" : currentChannel === "beta" ? "stable" : null;
    if (!next || !confirm(`Promote to ${next}?`)) return;

    await fetch(`/api/${type}s/${id}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: next }),
    });
    window.location.reload();
  }

  const filtered = filter === "all" ? items : items.filter((i) => i.channel === filter);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Releases</h1>
        <p className="text-sm text-muted-foreground">
          Manage deployment channels: dev → beta → stable
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(["all", "dev", "beta", "stable"] as const).map((ch) => (
          <button
            key={ch}
            onClick={() => setFilter(ch)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === ch ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {ch === "all" ? "All" : ch}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-muted-foreground">
          <Rocket className="mb-2 h-10 w-10" />
          <p>No items in this channel</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-3">
                {item.type === "agent" ? (
                  <Bot className="h-5 w-5 text-primary" />
                ) : (
                  <GitFork className="h-5 w-5 text-primary" />
                )}
                <div>
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">v{item.version}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_COLORS[item.channel] ?? ""}`}>
                  {item.channel}
                </span>
                {item.channel !== "stable" && (
                  <button
                    onClick={() => promote(item.type, item.id, item.channel)}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    <ArrowRight className="h-3 w-3" />
                    {item.channel === "dev" ? "beta" : "stable"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
