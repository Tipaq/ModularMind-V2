import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Play,
  RefreshCw,
  Trash2,
  CalendarClock,
} from "lucide-react";
import { Badge, Button, cn } from "@modularmind/ui";
import type { ScheduledTask } from "@modularmind/api-client";
import { useScheduledTasksStore } from "../stores/scheduled-tasks";
import { ScheduledTaskOverviewTab } from "../components/scheduled-tasks/ScheduledTaskOverviewTab";
import { ScheduledTaskConfigTab } from "../components/scheduled-tasks/ScheduledTaskConfigTab";
import { ScheduledTaskRunsTab } from "../components/scheduled-tasks/ScheduledTaskRunsTab";

type TabKey = "overview" | "configuration" | "runs";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "configuration", label: "Configuration" },
  { key: "runs", label: "Runs" },
];

export function ScheduledTaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [triggering, setTriggering] = useState(false);

  const {
    selectedTask: task,
    taskRuns,
    loading,
    fetchTask,
    fetchTaskRuns,
    updateTask,
    deleteTask,
    duplicateTask,
    toggleTask,
    triggerTask,
  } = useScheduledTasksStore();

  useEffect(() => {
    if (id) {
      fetchTask(id);
      fetchTaskRuns(id);
    }
  }, [id, fetchTask, fetchTaskRuns]);

  const handleDelete = useCallback(async () => {
    if (!task || !confirm(`Delete "${task.name}"?`)) return;
    await deleteTask(task.id);
    navigate("/scheduled-tasks");
  }, [task, deleteTask, navigate]);

  const handleDuplicate = useCallback(async () => {
    if (!task) return;
    await duplicateTask(task.id);
    navigate("/scheduled-tasks");
  }, [task, duplicateTask, navigate]);

  const handleTrigger = useCallback(async () => {
    if (!task?.enabled) return;
    setTriggering(true);
    try {
      await triggerTask(task.id);
      setTimeout(() => fetchTaskRuns(task.id), 2000);
    } finally {
      setTriggering(false);
    }
  }, [task, triggerTask, fetchTaskRuns]);

  const handleSave = useCallback(
    async (data: Partial<ScheduledTask>) => {
      if (!id) return;
      await updateTask(id, data);
    },
    [id, updateTask],
  );

  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (id) toggleTask(id, enabled);
    },
    [id, toggleTask],
  );

  if (loading || !task) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/scheduled-tasks"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Tasks
            </Link>
            <div className="h-4 w-px bg-border" />
            <CalendarClock className="h-5 w-5 text-warning" />
            <h1 className="text-lg font-semibold">{task.name}</h1>
            <Badge variant="outline" className="font-mono text-xs">
              v{task.version}
            </Badge>
            <Badge
              variant={task.enabled ? "default" : "secondary"}
              className="text-xs"
            >
              {task.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {task.enabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleTrigger}
                disabled={triggering}
              >
                <Play className="h-4 w-4 mr-1" />
                {triggering ? "Triggering..." : "Run Now"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleDuplicate}>
              <Copy className="h-4 w-4 mr-1" /> Duplicate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 mt-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "pb-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "overview" && (
          <ScheduledTaskOverviewTab
            task={task}
            runs={taskRuns}
            onToggle={handleToggle}
          />
        )}
        {activeTab === "configuration" && (
          <ScheduledTaskConfigTab task={task} onSave={handleSave} />
        )}
        {activeTab === "runs" && (
          <ScheduledTaskRunsTab runs={taskRuns} isLoading={loading} />
        )}
      </div>
    </div>
  );
}
