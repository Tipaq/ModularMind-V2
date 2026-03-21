import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Plus, Copy, Trash2, Play } from "lucide-react";
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
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";
import type { ScheduledTask } from "@modularmind/api-client";
import { useScheduledTasksStore } from "../stores/scheduled-tasks";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search tasks..." },
];

export default function ScheduledTasks() {
  const navigate = useNavigate();
  const {
    tasks,
    loading,
    page,
    totalPages,
    total,
    fetchTasks,
    createTask,
    deleteTask,
    duplicateTask,
    toggleTask,
    triggerTask,
  } = useScheduledTasksStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  useEffect(() => {
    fetchTasks(1);
  }, [fetchTasks]);

  const filtered = useMemo(() => {
    if (!filterValues.search) return tasks;
    const s = filterValues.search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.name.toLowerCase().includes(s) ||
        t.description?.toLowerCase().includes(s),
    );
  }, [tasks, filterValues.search]);

  const handleRowClick = useCallback(
    (task: ScheduledTask) => navigate(`/scheduled-tasks/${task.id}`),
    [navigate],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const task = await createTask(form);
      setShowCreateDialog(false);
      setForm({ name: "", description: "" });
      navigate(`/scheduled-tasks/${task.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = useCallback(
    async (task: ScheduledTask) => {
      if (!confirm(`Delete "${task.name}"?`)) return;
      await deleteTask(task.id);
    },
    [deleteTask],
  );

  const getTriggerLabel = (config: ScheduledTask["config"]) => {
    const triggerType = config?.trigger?.type;
    const source = config?.trigger?.source;
    if (!triggerType) return "Not configured";
    if (source) return `${triggerType} / ${source}`;
    return triggerType;
  };

  const getTargetLabel = (config: ScheduledTask["config"]) => {
    if (config?.execution?.graph_id) return "Graph";
    if (config?.execution?.agent_id) return "Agent";
    return "—";
  };

  const columns: ResourceColumn<ScheduledTask>[] = [
    {
      key: "name",
      header: "Task",
      render: (t) => (
        <div>
          <p className="font-medium text-sm">{t.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {t.description || "No description"}
          </p>
        </div>
      ),
    },
    {
      key: "trigger",
      header: "Trigger",
      className: "hidden md:table-cell",
      render: (t) => (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {getTriggerLabel(t.config)}
        </Badge>
      ),
    },
    {
      key: "target",
      header: "Target",
      className: "hidden md:table-cell",
      render: (t) => (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {getTargetLabel(t.config)}
        </Badge>
      ),
    },
    {
      key: "enabled",
      header: "Enabled",
      className: "hidden lg:table-cell",
      render: (t) => (
        <Switch
          checked={t.enabled}
          onCheckedChange={(checked) => toggleTask(t.id, checked)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        gradient="from-warning to-warning/70"
        title="Scheduled Tasks"
        description="Automated workflows with triggers and actions"
        actions={
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        }
      />

      <ResourceFilters
        filters={filterConfigs}
        values={filterValues}
        onChange={(key, value) => setFilterValues((prev) => ({ ...prev, [key]: value }))}
      />

      <ResourceTable<ScheduledTask>
        items={filtered}
        columns={columns}
        pagination={{ page, totalPages, totalItems: total }}
        onPageChange={(p) => fetchTasks(p)}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={CalendarClock}
            title="No scheduled tasks yet"
            description="Create your first task to get started."
            action={
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Task
              </Button>
            }
          />
        }
        keyExtractor={(t) => t.id}
        rowActions={(t) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => triggerTask(t.id)}
                disabled={!t.enabled}
              >
                <Play className="mr-2 h-3.5 w-3.5" />
                Run Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateTask(t.id)}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(t)}
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
            <DialogTitle>Create Scheduled Task</DialogTitle>
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateDialog(false)}
              >
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
