import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Plus, Copy, Trash2, Play } from "lucide-react";
import {
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  PageHeader,
  EmptyState,
  ResourceTable,
  ResourceFilters,
  Switch,
} from "@modularmind/ui";
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";
import type { ScheduledTask } from "@modularmind/api-client";
import { useScheduledTasksStore } from "../stores/scheduled-tasks";
import { CreateScheduledTaskDialog } from "../components/scheduled-tasks/CreateScheduledTaskDialog";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search tasks..." },
];

function asUtc(dateStr: string): string {
  if (dateStr.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(dateStr)) return dateStr;
  return `${dateStr}Z`;
}

function formatSchedule(task: ScheduledTask): string {
  if (task.schedule_type === "interval" && task.interval_value && task.interval_unit) {
    return `Every ${task.interval_value} ${task.interval_unit}`;
  }
  if (task.schedule_type === "one_shot" && task.scheduled_at) {
    return new Date(asUtc(task.scheduled_at)).toLocaleString();
  }
  return "Manual";
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(asUtc(dateStr)).getTime();
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
    fetchTasks, deleteTask, duplicateTask, toggleTask, triggerTask,
  } = useScheduledTasksStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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

      <CreateScheduledTaskDialog
        isOpen={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={(task) => navigate(`/scheduled-tasks/${task.id}`)}
      />
    </div>
  );
}
