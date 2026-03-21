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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@modularmind/ui";
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";
import type { ScheduledTask, ScheduleType, IntervalUnit, TargetType } from "@modularmind/api-client";
import { useScheduledTasksStore } from "../stores/scheduled-tasks";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search tasks..." },
];

function formatSchedule(task: ScheduledTask): string {
  if (task.schedule_type === "interval" && task.interval_value && task.interval_unit) {
    return `Every ${task.interval_value} ${task.interval_unit}`;
  }
  if (task.schedule_type === "one_shot" && task.scheduled_at) {
    return new Date(task.scheduled_at).toLocaleString();
  }
  return "Manual";
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ScheduledTasks() {
  const navigate = useNavigate();
  const {
    tasks, loading, page, totalPages, total,
    fetchTasks, createTask, deleteTask, duplicateTask, toggleTask, triggerTask,
  } = useScheduledTasksStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    schedule_type: "manual" as ScheduleType,
    interval_value: 1,
    interval_unit: "hours" as IntervalUnit,
    scheduled_at: "",
    target_type: "agent" as TargetType,
    target_id: "",
    input_text: "",
  });

  useEffect(() => {
    fetchTasks(1);
  }, [fetchTasks]);

  const filtered = useMemo(() => {
    if (!filterValues.search) return tasks;
    const s = filterValues.search.toLowerCase();
    return tasks.filter(
      (t) => t.name.toLowerCase().includes(s) || t.description?.toLowerCase().includes(s),
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
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        schedule_type: form.schedule_type,
        target_type: form.target_type,
        target_id: form.target_id || undefined,
        input_text: form.input_text,
      };
      if (form.schedule_type === "interval") {
        payload.interval_value = form.interval_value;
        payload.interval_unit = form.interval_unit;
      }
      if (form.schedule_type === "one_shot" && form.scheduled_at) {
        payload.scheduled_at = form.scheduled_at;
      }
      const task = await createTask(payload as Partial<ScheduledTask> & { name: string });
      setShowCreateDialog(false);
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
      key: "schedule",
      header: "Schedule",
      className: "hidden md:table-cell",
      render: (t) => (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {formatSchedule(t)}
        </Badge>
      ),
    },
    {
      key: "target",
      header: "Target",
      className: "hidden md:table-cell",
      render: (t) => (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {t.target_id ? `${t.target_type}: ${t.target_id.slice(0, 8)}...` : "—"}
        </Badge>
      ),
    },
    {
      key: "last_run",
      header: "Last Run",
      className: "hidden lg:table-cell",
      render: (t) => (
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(t.last_run_at)}
        </span>
      ),
    },
    {
      key: "enabled",
      header: "Enabled",
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
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">...</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => triggerTask(t.id)} disabled={!t.enabled}>
                <Play className="mr-2 h-3.5 w-3.5" /> Run Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateTask(t.id)}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDelete(t)} className="text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
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
              Configure when and what to execute automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Issue Review Pipeline"
              required
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Review GitHub issues every hour"
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">Schedule</label>
              <Select
                value={form.schedule_type}
                onValueChange={(v) => setForm({ ...form, schedule_type: v as ScheduleType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Interval (recurring)</SelectItem>
                  <SelectItem value="one_shot">One-shot (date/time)</SelectItem>
                  <SelectItem value="manual">Manual only</SelectItem>
                </SelectContent>
              </Select>

              {form.schedule_type === "interval" && (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={form.interval_value}
                    onChange={(e) => setForm({ ...form, interval_value: Number(e.target.value) })}
                    className="w-20"
                    min={1}
                  />
                  <Select
                    value={form.interval_unit}
                    onValueChange={(v) => setForm({ ...form, interval_unit: v as IntervalUnit })}
                  >
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.schedule_type === "one_shot" && (
                <Input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Target</label>
              <div className="flex gap-2">
                <Select
                  value={form.target_type}
                  onValueChange={(v) => setForm({ ...form, target_type: v as TargetType })}
                >
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="graph">Graph</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={form.target_id}
                  onChange={(e) => setForm({ ...form, target_id: e.target.value })}
                  placeholder="Target ID"
                  className="flex-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Instruction</label>
              <textarea
                value={form.input_text}
                onChange={(e) => setForm({ ...form, input_text: e.target.value })}
                className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[60px] placeholder:text-muted-foreground"
                placeholder="What should the agent/graph do?"
                rows={2}
              />
            </div>

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
