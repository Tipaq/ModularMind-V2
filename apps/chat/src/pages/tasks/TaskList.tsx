import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Play, RefreshCw, Search } from "lucide-react";
import {
  Badge, Button, EmptyState, Input, Switch, relativeTime,
} from "@modularmind/ui";
import type { ScheduledTask, ScheduledTaskListResponse } from "@modularmind/api-client";
import { api } from "../../lib/api";

export function TaskList() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ScheduledTaskListResponse>("/scheduled-tasks/?page_size=100");
      setTasks(data.items ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const filtered = useMemo(() => {
    if (!search) return tasks;
    const lower = search.toLowerCase();
    return tasks.filter((t) => t.name.toLowerCase().includes(lower));
  }, [tasks, search]);

  const handleToggle = useCallback(async (taskId: string, enabled: boolean) => {
    try {
      await api.patch(`/scheduled-tasks/${taskId}`, { enabled });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, enabled } : t)));
    } catch { /* silently fail */ }
  }, []);

  const handleTrigger = useCallback(async (taskId: string) => {
    try {
      await api.post(`/scheduled-tasks/${taskId}/trigger`);
      await loadTasks();
    } catch { /* silently fail */ }
  }, [loadTasks]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Scheduled Tasks</h1>
          <p className="text-sm text-muted-foreground">View and manage your scheduled automations</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filtered.length} tasks</Badge>
          <Button variant="ghost" size="sm" onClick={loadTasks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={search ? "No tasks match your search" : "No scheduled tasks yet"}
          description="Scheduled tasks automate agent executions on a recurring basis."
        />
      ) : (
        <div className="rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Schedule</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Last Run</th>
                <th className="px-4 py-3 font-medium w-20">Enabled</th>
                <th className="px-4 py-3 font-medium w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr
                  key={task.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[200px]">{task.name}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {task.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge variant="outline">{formatSchedule(task)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {task.last_run_at ? relativeTime(task.last_run_at) : "Never"}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={task.enabled}
                      onCheckedChange={(checked) => handleToggle(task.id, checked)}
                    />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTrigger(task.id)}
                      title="Run now"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatSchedule(task: ScheduledTask): string {
  if (task.schedule_type === "interval" && task.interval_value && task.interval_unit) {
    return `Every ${task.interval_value} ${task.interval_unit}`;
  }
  if (task.schedule_type === "one_shot") return "One-time";
  return "Manual";
}

export default TaskList;
