import { Activity, CheckCircle, Clock, CalendarClock } from "lucide-react";
import { Badge, Switch } from "@modularmind/ui";
import type { ScheduledTask, ScheduledTaskRun } from "@modularmind/api-client";

interface ScheduledTaskOverviewTabProps {
  task: ScheduledTask;
  runs: ScheduledTaskRun[];
  onToggle: (enabled: boolean) => void;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function formatSchedule(task: ScheduledTask): string {
  if (task.schedule_type === "interval" && task.interval_value && task.interval_unit) {
    return `Every ${task.interval_value} ${task.interval_unit}`;
  }
  if (task.schedule_type === "one_shot" && task.scheduled_at) {
    return `One-shot: ${new Date(task.scheduled_at).toLocaleString()}`;
  }
  return "Manual only";
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 0) return `in ${Math.abs(minutes)}m`;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ScheduledTaskOverviewTab({
  task,
  runs,
  onToggle,
}: ScheduledTaskOverviewTabProps) {
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const successRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0;
  const avgDuration =
    runs.filter((r) => r.duration_seconds).length > 0
      ? (
          runs.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) /
          runs.filter((r) => r.duration_seconds).length
        ).toFixed(1)
      : "—";

  const lastRun = runs[0];

  return (
    <div className="space-y-6 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {task.description || "No description"}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Enabled</span>
          <Switch checked={task.enabled} onCheckedChange={onToggle} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Total Runs" value={totalRuns} />
        <StatCard
          icon={CheckCircle}
          label="Success Rate"
          value={`${successRate}%`}
          sub={`${completedRuns} completed, ${failedRuns} failed`}
        />
        <StatCard
          icon={Clock}
          label="Avg Duration"
          value={avgDuration === "—" ? "—" : `${avgDuration}s`}
        />
        <StatCard
          icon={Activity}
          label="Last Run"
          value={lastRun ? lastRun.status : "Never"}
          sub={lastRun?.created_at ? formatRelativeTime(lastRun.created_at) : undefined}
        />
      </div>

      {/* Schedule & Target info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5" /> Schedule
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Type</span>
              <Badge variant="outline">{formatSchedule(task)}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Next run</span>
              <span className="text-sm">{formatRelativeTime(task.next_run_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Last run</span>
              <span className="text-sm">{formatRelativeTime(task.last_run_at)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Target
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Type</span>
              <Badge variant="outline">{task.target_type}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">ID</span>
              <span className="text-xs font-mono">{task.target_id || "Not set"}</span>
            </div>
            {task.input_text && (
              <div>
                <span className="text-sm text-muted-foreground">Instruction</span>
                <p className="text-xs mt-1 bg-muted/50 rounded p-2 line-clamp-3">
                  {task.input_text}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {task.tags.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
