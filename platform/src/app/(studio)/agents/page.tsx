"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bot, Plus, Copy, Trash2 } from "lucide-react";
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  PageHeader,
} from "@modularmind/ui";
import { EmptyState } from "@/components/studio/shared/EmptyState";
import { ResourceTable } from "@/components/studio/shared/ResourceTable";
import { ResourceFilters } from "@/components/studio/shared/ResourceFilters";
import { useAgentsStore, type PlatformAgent } from "@/stores/agents";
import type { ResourceColumn, ResourceFilterConfig, SortState } from "@modularmind/ui";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search agents..." },
];

export default function AgentsPage() {
  const router = useRouter();
  const {
    agents,
    loading,
    page,
    totalPages,
    total,
    fetchAgents,
    createAgent,
    deleteAgent,
    duplicateAgent,
  } = useAgentsStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", model: "", provider: "ollama" });

  useEffect(() => {
    fetchAgents(1);
  }, [fetchAgents]);

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    let result = agents;

    if (filterValues.search) {
      const s = filterValues.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(s) ||
          (a.description?.toLowerCase().includes(s) ?? false) ||
          a.model.toLowerCase().includes(s),
      );
    }

    if (filterValues.sort) {
      result = [...result].sort((a, b) => {
        switch (filterValues.sort) {
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "name_desc":
            return b.name.localeCompare(a.name);
          case "model_asc":
            return a.model.localeCompare(b.model);
          case "model_desc":
            return b.model.localeCompare(a.model);
          default:
            return 0;
        }
      });
    }

    return result;
  }, [agents, filterValues]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const sortState = useMemo((): SortState | null => {
    const s = filterValues.sort;
    if (!s) return null;
    if (s.endsWith("_asc")) return { key: s.replace(/_asc$/, ""), direction: "asc" };
    if (s.endsWith("_desc")) return { key: s.replace(/_desc$/, ""), direction: "desc" };
    return { key: s, direction: "asc" };
  }, [filterValues.sort]);

  const handleColumnSort = useCallback((sortKey: string) => {
    setFilterValues((prev) => {
      const current = prev.sort || "";
      if (current === `${sortKey}_asc` || current === sortKey) {
        return { ...prev, sort: `${sortKey}_desc` };
      }
      if (current === `${sortKey}_desc`) {
        return { ...prev, sort: "" };
      }
      return { ...prev, sort: `${sortKey}_asc` };
    });
  }, []);

  const handleRowClick = useCallback(
    (agent: PlatformAgent) => {
      router.push(`/agents/${agent.id}`);
    },
    [router],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.model.trim()) return;
    setCreating(true);
    try {
      const agent = await createAgent(form);
      setShowCreateDialog(false);
      setForm({ name: "", description: "", model: "", provider: "ollama" });
      router.push(`/agents/${agent.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = useCallback(
    async (agent: PlatformAgent) => {
      if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) return;
      try {
        await deleteAgent(agent.id);
      } catch {
        // Error is set in store
      }
    },
    [deleteAgent],
  );

  const handleDuplicate = useCallback(
    async (agent: PlatformAgent) => {
      try {
        await duplicateAgent(agent.id);
      } catch {
        // Error is set in store
      }
    },
    [duplicateAgent],
  );

  const columns: ResourceColumn<PlatformAgent>[] = [
    {
      key: "name",
      header: "Agent",
      sortKey: "name",
      render: (a) => (
        <div>
          <p className="font-medium text-sm">{a.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {a.description || "No description"}
          </p>
        </div>
      ),
    },
    {
      key: "model",
      header: "Model",
      sortKey: "model",
      className: "hidden md:table-cell",
      render: (a) => (
        <span className="text-sm text-muted-foreground font-mono">
          {a.model || "—"}
        </span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      className: "hidden md:table-cell",
      render: (a) => (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {a.provider}
        </Badge>
      ),
    },
    {
      key: "version",
      header: "Version",
      className: "hidden lg:table-cell",
      render: (a) => (
        <Badge variant="outline" className="text-xs font-mono">
          v{a.version}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bot}
        gradient="from-success to-success/70"
        title="Agents"
        description="Manage and configure AI agents"
        actions={
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Agent
          </Button>
        }
      />

      <ResourceFilters
        filters={filterConfigs}
        values={filterValues}
        onChange={handleFilterChange}
      />

      <ResourceTable<PlatformAgent>
        items={filtered}
        columns={columns}
        pagination={{
          page,
          totalPages,
          totalItems: total,
        }}
        onPageChange={(p) => fetchAgents(p)}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Create your first AI agent to get started."
            action={
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Agent
              </Button>
            }
          />
        }
        keyExtractor={(a) => a.id}
        sortState={sortState}
        onSort={handleColumnSort}
        rowActions={(a) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDuplicate(a)}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(a)}
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
            <DialogTitle>Create Agent</DialogTitle>
            <DialogDescription>
              Configure a new AI agent with a model and provider.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Agent"
              required
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="A brief description..."
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Provider</label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Model"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="e.g. llama3.2, gpt-4o, claude-3-haiku"
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !form.name.trim() || !form.model.trim()}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
