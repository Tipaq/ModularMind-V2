"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, Trash2, Server } from "lucide-react";

type Client = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  engines?: { id: string; name: string; status: string; apiKey: string }[];
  _count?: { engines: number };
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("http://localhost:8000");
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/clients");
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, engineUrl: newUrl }),
    });
    if (res.ok) {
      setNewName("");
      setNewUrl("http://localhost:8000");
      setShowCreate(false);
      load();
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this client and all its engines?")) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-muted-foreground">Manage client organizations and their engines</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Client
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Client Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Acme Corp"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Engine URL</label>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="http://localhost:8000"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Client"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            An API key will be auto-generated for the first engine.
          </p>
        </form>
      )}

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-muted-foreground">
          <Building2 className="mb-2 h-10 w-10" />
          <p>No clients yet</p>
          <p className="text-sm">Create your first client to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <div key={client.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">{client.name}</h3>
                </div>
                <button
                  onClick={() => handleDelete(client.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                <Server className="h-3.5 w-3.5" />
                {client._count?.engines ?? client.engines?.length ?? 0} engine(s)
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Created {new Date(client.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
