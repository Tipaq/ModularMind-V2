import { useOutletContext } from "react-router-dom";
import { BookOpen, CalendarClock, MessageSquare, AppWindow } from "lucide-react";
import type { ProjectDetail, ProjectResourceCounts } from "@modularmind/api-client";
import { relativeTime } from "@modularmind/ui";

interface ProjectContext {
  project: ProjectDetail;
  resourceCounts: ProjectResourceCounts | null;
}

export function ProjectOverview() {
  const { project, resourceCounts } = useOutletContext<ProjectContext>();

  const counts = resourceCounts ?? { conversations: 0, collections: 0, mini_apps: 0, scheduled_tasks: 0 };

  return (
    <div className="p-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={MessageSquare} label="Conversations" value={counts.conversations} />
        <StatCard icon={BookOpen} label="Collections" value={counts.collections} />
        <StatCard icon={AppWindow} label="Mini-Apps" value={counts.mini_apps} />
        <StatCard icon={CalendarClock} label="Tasks" value={counts.scheduled_tasks} />
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Members</h2>
        <div className="rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody>
              {project.members.map((member) => (
                <tr key={member.user_id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{member.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${roleColor(member.role)}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {relativeTime(member.joined_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}

function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border/50 p-4 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function roleColor(role: string): string {
  if (role === "owner") return "bg-warning/10 text-warning";
  if (role === "editor") return "bg-info/10 text-info";
  return "bg-muted text-muted-foreground";
}

export default ProjectOverview;
