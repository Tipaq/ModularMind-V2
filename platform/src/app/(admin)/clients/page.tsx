"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTableSort } from "@/hooks/useTableSort";
import { useRouter } from "next/navigation";
import { Building2, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Input,
  PageHeader,
  EmptyState,
  ResourceTable,
  ResourceFilters,
} from "@modularmind/ui";
import { useClientsStore, type PlatformClient } from "@/stores/clients";
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search clients..." },
];

export default function ClientsPage() {
  const router = useRouter();
  const {
    clients,
    loading,
    page,
    totalPages,
    total,
    fetchClients,
    createClient,
    deleteClient,
  } = useClientsStore();

  const { filterValues, sortState, handleColumnSort, handleFilterChange } = useTableSort();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", engineUrl: "http://localhost:8000" });

  useEffect(() => {
    fetchClients(1);
  }, [fetchClients]);

  const filtered = useMemo(() => {
    let result = clients;

    if (filterValues.search) {
      const s = filterValues.search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(s));
    }

    if (filterValues.sort) {
      result = [...result].sort((a, b) => {
        switch (filterValues.sort) {
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "name_desc":
            return b.name.localeCompare(a.name);
          default:
            return 0;
        }
      });
    }

    return result;
  }, [clients, filterValues]);


  const handleRowClick = useCallback(
    (client: PlatformClient) => {
      router.push(`/clients/${client.id}`);
    },
    [router],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const client = await createClient({
        name: form.name.trim(),
        engineUrl: form.engineUrl.trim() || undefined,
      });
      setShowCreateDialog(false);
      setForm({ name: "", engineUrl: "http://localhost:8000" });
      router.push(`/clients/${client.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = useCallback(
    async (client: PlatformClient) => {
      if (!confirm(`Delete "${client.name}" and all its engines?`)) return;
      try {
        await deleteClient(client.id);
      } catch {
        // Error handled in store
      }
    },
    [deleteClient],
  );

  const columns: ResourceColumn<PlatformClient>[] = [
    {
      key: "name",
      header: "Client",
      sortKey: "name",
      render: (c) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-sm">{c.name}</span>
        </div>
      ),
    },
    {
      key: "engines",
      header: "Engines",
      className: "hidden md:table-cell",
      render: (c) => (
        <Badge variant="outline" className="text-xs font-mono">
          {c._count?.engines ?? 0}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "Created",
      className: "hidden lg:table-cell",
      render: (c) => (
        <span className="text-sm text-muted-foreground">
          {new Date(c.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        gradient="from-primary to-primary/70"
        title="Clients"
        description="Manage client organizations and their engines"
        actions={
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Client
          </Button>
        }
      />

      <ResourceFilters
        filters={filterConfigs}
        values={filterValues}
        onChange={handleFilterChange}
      />

      <ResourceTable<PlatformClient>
        items={filtered}
        columns={columns}
        pagination={{
          page,
          totalPages,
          totalItems: total,
        }}
        onPageChange={(p) => fetchClients(p)}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={Building2}
            title="No clients yet"
            description="Create your first client to get started."
            action={
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Client
              </Button>
            }
          />
        }
        keyExtractor={(c) => c.id}
        sortState={sortState}
        onSort={handleColumnSort}
        rowActions={(c) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleDelete(c)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Client</DialogTitle>
            <DialogDescription>
              Create a new client organization. An API key will be auto-generated for the first engine.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <Input
              label="Client Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Corp"
              required
            />
            <Input
              label="Engine URL"
              value={form.engineUrl}
              onChange={(e) => setForm({ ...form, engineUrl: e.target.value })}
              placeholder="http://localhost:8000"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !form.name.trim()}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
