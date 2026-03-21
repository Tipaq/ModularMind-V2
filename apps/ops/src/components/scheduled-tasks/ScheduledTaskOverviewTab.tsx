import { Activity, CheckCircle, Clock } from "lucide-react";
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
  const triggerType = task.config?.trigger?.type || "Not configured";
  const source = task.config?.trigger?.source || "—";

  return (
    <div className="space-y-6 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {task.description || "No description"}
          </p>
        </div>
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
          value={
            lastRun
              ? lastRun.status
              : "Never"
          }
          sub={
            lastRun?.created_at
              ? new Date(lastRun.created_at).toLocaleString()
              : undefined
          }
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Trigger Configuration
        </h3>
        <div className="flex flex-wrap gap-3">
          <div>
            <span className="text-xs text-muted-foreground">Type</span>
            <div>
              <Badge variant="outline">{triggerType}</Badge>
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Source</span>
            <div>
              <Badge variant="outline">{source}</Badge>
            </div>
          </div>
          {task.config?.trigger?.interval_seconds && (
            <div>
              <span className="text-xs text-muted-foreground">Interval</span>
              <div>
                <Badge variant="outline">
                  {task.config.trigger.interval_seconds}s
                </Badge>
              </div>
            </div>
          )}
          {task.config?.trigger?.repos && task.config.trigger.repos.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Repos</span>
              <div className="flex gap-1 flex-wrap">
                {task.config.trigger.repos.map((repo) => (
                  <Badge key={repo} variant="outline" className="font-mono text-xs">
                    {repo}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {task.tags.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
