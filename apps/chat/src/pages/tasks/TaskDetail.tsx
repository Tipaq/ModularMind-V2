import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { Badge, Button, Switch, relativeTime } from "@modularmind/ui";
import type { ScheduledTask, ScheduledTaskRun } from "@modularmind/api-client";
import { api } from "../../lib/api";

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<ScheduledTask | null>(null);
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const [taskData, runsData] = await Promise.all([
        api.get<ScheduledTask>(`/scheduled-tasks/${taskId}`),
        api.get<{ items: ScheduledTaskRun[] }>(`/scheduled-tasks/${taskId}/runs?page_size=20`),
      ]);
      setTask(taskData);
      setRuns(runsData.items ?? []);
    } catch {
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = useCallback(async (enabled: boolean) => {
    if (!taskId) return;
    try {
      const updated = await api.patch<ScheduledTask>(`/scheduled-tasks/${taskId}`, { enabled });
      setTask(updated);
    } catch { /* silently fail */ }
  }, [taskId]);

  const handleTrigger = useCallback(async () => {
    if (!taskId) return;
    try {
      await api.post(`/scheduled-tasks/${taskId}/trigger`);
      await loadData();
    } catch { /* silently fail */ }
  }, [taskId, loadData]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Task not found</p>
        <Button variant="outline" onClick={() => navigate("/tasks")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tasks
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/tasks")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">{task.name}</h1>
          {task.description && (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Switch checked={task.enabled} onCheckedChange={handleToggle} />
          <Button variant="outline" size="sm" onClick={handleTrigger}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> Run Now
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard label="Schedule" value={formatSchedule(task)} />
        <InfoCard label="Last Run" value={task.last_run_at ? relativeTime(task.last_run_at) : "Never"} />
        <InfoCard label="Next Run" value={task.next_run_at ? relativeTime(task.next_run_at) : "Not scheduled"} />
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Run History</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet</p>
        ) : (
          <div className="rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Duration</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {run.duration_seconds != null ? `${run.duration_seconds.toFixed(1)}s` : "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {relativeTime(run.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string }> = {
    completed: { className: "bg-success/10 text-success" },
    running: { className: "bg-info/10 text-info" },
    failed: { className: "bg-destructive/10 text-destructive" },
    pending: { className: "bg-muted text-muted-foreground" },
    skipped: { className: "bg-warning/10 text-warning" },
  };
  const cfg = config[status] ?? config.pending;
  return <Badge variant="outline" className={cfg.className}>{status}</Badge>;
}

function formatSchedule(task: ScheduledTask): string {
  if (task.schedule_type === "interval" && task.interval_value && task.interval_unit) {
    return `Every ${task.interval_value} ${task.interval_unit}`;
  }
  if (task.schedule_type === "one_shot") return "One-time";
  return "Manual";
}

export default TaskDetail;
