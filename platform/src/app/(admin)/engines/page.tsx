"use client";

import { useEffect, useState } from "react";
import { Server, Wifi, WifiOff, Clock, Key } from "lucide-react";
import { STATUS_COLORS, relativeTime } from "@modularmind/ui";

type Engine = {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  status: string;
  lastSeen: string | null;
  version: number;
  createdAt: string;
  client: { id: string; name: string };
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.offline}`}>
      {status === "synced" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {status}
    </span>
  );
}

export default function EnginesPage() {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      // Single request: fetch all clients with engines included
      const res = await fetch("/api/clients?include=engines");
      if (!res.ok) { setLoading(false); return; }
      const clients = await res.json();

      const allEngines: Engine[] = [];
      for (const client of clients) {
        for (const eng of client.engines ?? []) {
          allEngines.push({ ...eng, client: { id: client.id, name: client.name } });
        }
      }
      setEngines(allEngines);
      setLoading(false);
    }
    load();
  }, []);

  function toggleKey(id: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Engines</h1>
        <p className="text-sm text-muted-foreground">Registered engine instances and their sync status</p>
      </div>

      {engines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-muted-foreground">
          <Server className="mb-2 h-10 w-10" />
          <p>No engines registered</p>
          <p className="text-sm">Create a client to generate an engine API key</p>
        </div>
      ) : (
        <div className="space-y-3">
          {engines.map((engine) => (
            <div key={engine.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" />
                    <h3 className="font-medium">{engine.name}</h3>
                    <StatusBadge status={engine.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Client: {engine.client.name}
                  </p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Last seen: {engine.lastSeen ? relativeTime(engine.lastSeen) : "Never"}
                  </div>
                  <div className="mt-0.5">v{engine.version}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">URL:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{engine.url}</code>
              </div>

              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">API Key:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {revealedKeys.has(engine.id) ? engine.apiKey : `${engine.apiKey.slice(0, 8)}...`}
                </code>
                <button
                  onClick={() => toggleKey(engine.id)}
                  className="text-xs text-primary hover:underline"
                >
                  <Key className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
