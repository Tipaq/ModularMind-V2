"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTableSort } from "@/hooks/useTableSort";
import { useRouter } from "next/navigation";
import { Zap, Plus, Copy, Trash2 } from "lucide-react";
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
  Switch,
} from "@modularmind/ui";
import { useAutomationsStore, type PlatformAutomation } from "@/stores/automations";
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search automations..." },
];

export default function AutomationsPage() {
  const router = useRouter();
  const {
    automations,
    loading,
    page,
    totalPages,
    total,
    fetchAutomations,
    createAutomation,
    deleteAutomation,
    duplicateAutomation,
    toggleAutomation,
  } = useAutomationsStore();

  const { filterValues, sortState, handleColumnSort, handleFilterChange } = useTableSort();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  useEffect(() => {
    fetchAutomations(1);
  }, [fetchAutomations]);

  const filtered = useMemo(() => {
    let result = automations;

    if (filterValues.search) {
      const s = filterValues.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(s) ||
          (a.description?.toLowerCase().includes(s) ?? false),
      );
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
  }, [automations, filterValues]);

  const handleRowClick = useCallback(
    (automation: PlatformAutomation) => {
      router.push(`/automations/${automation.id}`);
    },
    [router],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const automation = await createAutomation(form);
      setShowCreateDialog(false);
      setForm({ name: "", description: "" });
      router.push(`/automations/${automation.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = useCallback(
    async (automation: PlatformAutomation) => {
      if (!confirm(`Are you sure you want to delete "${automation.name}"?`)) return;
      try {
        await deleteAutomation(automation.id);
      } catch {
        // Error is set in store
      }
    },
    [deleteAutomation],
  );

  const handleDuplicate = useCallback(
    async (automation: PlatformAutomation) => {
      try {
        await duplicateAutomation(automation.id);
      } catch {
        // Error is set in store
      }
    },
    [duplicateAutomation],
  );

  const getTriggerLabel = (config: PlatformAutomation["config"]) => {
    const type = config.trigger?.type;
    const source = config.trigger?.source;
    if (!type) return "Not configured";
    if (source) return `${type} / ${source}`;
    return type;
  };

  const getTargetLabel = (config: PlatformAutomation["config"]) => {
    if (config.execution?.graph_id) return "Graph";
    if (config.execution?.agent_id) return "Agent";
    return "Not configured";
  };

  const columns: ResourceColumn<PlatformAutomation>[] = [
    {
      key: "name",
      header: "Automation",
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
      key: "trigger",
      header: "Trigger",
      className: "hidden md:table-cell",
      render: (a) => (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {getTriggerLabel(a.config)}
        </Badge>
      ),
    },
    {
      key: "target",
      header: "Target",
      className: "hidden md:table-cell",
      render: (a) => (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {getTargetLabel(a.config)}
        </Badge>
      ),
    },
    {
      key: "enabled",
      header: "Enabled",
      className: "hidden lg:table-cell",
      render: (a) => (
        <Switch
          checked={a.enabled}
          onCheckedChange={(checked) => {
            toggleAutomation(a.id, checked);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Zap}
        gradient="from-warning to-warning/70"
        title="Automations"
        description="Configure automated workflows and triggers"
        actions={
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Automation
          </Button>
        }
      />

      <ResourceFilters
        filters={filterConfigs}
        values={filterValues}
        onChange={handleFilterChange}
      />

      <ResourceTable<PlatformAutomation>
        items={filtered}
        columns={columns}
        pagination={{
          page,
          totalPages,
          totalItems: total,
        }}
        onPageChange={(p) => fetchAutomations(p)}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={Zap}
            title="No automations yet"
            description="Create your first automation to get started."
            action={
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Automation
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
            <DialogTitle>Create Automation</DialogTitle>
            <DialogDescription>
              Configure a new automated workflow with triggers and actions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="PR Review Pipeline"
              required
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Automatically review and resolve pull requests"
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
