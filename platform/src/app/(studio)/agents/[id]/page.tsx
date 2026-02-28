"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

type Agent = {
  id: string;
  name: string;
  description: string;
  model: string;
  provider: string;
  config: Record<string, unknown>;
  channel: string;
  version: number;
  tags: string[];
};

export default function AgentEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configJson, setConfigJson] = useState("{}");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/agents/${id}`);
      if (!res.ok) { router.push("/agents"); return; }
      const data = await res.json();
      setAgent(data);
      setConfigJson(JSON.stringify(data.config, null, 2));
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!agent) return;
    setSaving(true);

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configJson);
    } catch {
      alert("Invalid JSON in config");
      setSaving(false);
      return;
    }

    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: agent.name,
        description: agent.description,
        model: agent.model,
        provider: agent.provider,
        config,
        tags: agent.tags,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setAgent(updated);
    }
    setSaving(false);
  }

  if (loading || !agent) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/agents" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to agents
        </Link>
        <h1 className="text-2xl font-bold">{agent.name}</h1>
        <p className="text-sm text-muted-foreground">
          {agent.channel} / v{agent.version}
        </p>
      </div>

      <form onSubmit={handleSave} className="max-w-2xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              value={agent.name}
              onChange={(e) => setAgent({ ...agent, name: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Provider</label>
            <select
              value={agent.provider}
              onChange={(e) => setAgent({ ...agent, provider: e.target.value })}
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
              value={agent.model}
              onChange={(e) => setAgent({ ...agent, model: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tags (comma-separated)</label>
            <input
              value={agent.tags.join(", ")}
              onChange={(e) => setAgent({ ...agent, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            value={agent.description}
            onChange={(e) => setAgent({ ...agent, description: e.target.value })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={2}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Config (JSON)</label>
          <textarea
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            rows={12}
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
