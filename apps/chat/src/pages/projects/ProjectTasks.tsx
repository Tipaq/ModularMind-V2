import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { Badge, EmptyState, Switch, relativeTime } from "@modularmind/ui";
import type { ProjectDetail, ScheduledTask, ScheduledTaskListResponse } from "@modularmind/api-client";
import { api } from "../../lib/api";

interface ProjectContext {
  project: ProjectDetail;
}

export function ProjectTasks() {
  const { project } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ScheduledTaskListResponse>(
        `/scheduled-tasks/?project_id=${project.id}&page_size=100`,
      );
      setTasks(data.items ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleToggle = useCallback(async (taskId: string, enabled: boolean) => {
    try {
      await api.patch(`/scheduled-tasks/${taskId}`, { enabled });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, enabled } : t)));
    } catch { /* silently fail */ }
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState
          icon={CalendarClock}
          title="No scheduled tasks in this project"
          description="Assign tasks to this project from the Tasks page."
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="rounded-xl border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Task</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Schedule</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Last Run</th>
              <th className="px-4 py-3 font-medium w-20">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium truncate max-w-[200px]">{task.name}</p>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

export default ProjectTasks;
