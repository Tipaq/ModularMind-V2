import { useNavigate, useOutletContext } from "react-router-dom";
import { BookOpen, MessageSquare, AppWindow, CalendarClock, Users, Plus } from "lucide-react";
import type { ProjectDetail, ProjectResourceCounts } from "@modularmind/api-client";
import { Button, relativeTime } from "@modularmind/ui";

interface ProjectContext {
  project: ProjectDetail;
  resourceCounts: ProjectResourceCounts | null;
}

export function ProjectOverview() {
  const { project, resourceCounts } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();

  const counts = resourceCounts ?? { conversations: 0, collections: 0, mini_apps: 0, scheduled_tasks: 0 };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Project header with description + start conversation */}
      <div className="mb-8 text-center">
        {project.description && (
          <p className="text-sm text-muted-foreground mb-4">{project.description}</p>
        )}
        <Button
          onClick={() => navigate("conversations")}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Start a conversation
        </Button>
      </div>

      {/* Cards grid — Claude-style */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Knowledge card */}
        <OverviewCard
          title="Knowledge"
          description={counts.collections > 0
            ? `${counts.collections} collection${counts.collections > 1 ? "s" : ""} linked to this project`
            : "Add documents and files for your agents to reference"}
          icon={BookOpen}
          actionLabel={counts.collections > 0 ? "View" : "Add"}
          onAction={() => navigate("knowledge")}
        />

        {/* Apps card */}
        <OverviewCard
          title="Apps"
          description={counts.mini_apps > 0
            ? `${counts.mini_apps} app${counts.mini_apps > 1 ? "s" : ""} created in this project`
            : "Apps created by agents will appear here"}
          icon={AppWindow}
          actionLabel="View"
          onAction={() => navigate("apps")}
        />

        {/* Conversations card */}
        <OverviewCard
          title="Conversations"
          description={counts.conversations > 0
            ? `${counts.conversations} conversation${counts.conversations > 1 ? "s" : ""} in this project`
            : "Start chatting within this project context"}
          icon={MessageSquare}
          actionLabel={counts.conversations > 0 ? "View" : "Start"}
          onAction={() => navigate("conversations")}
        />

        {/* Tasks card */}
        <OverviewCard
          title="Scheduled Tasks"
          description={counts.scheduled_tasks > 0
            ? `${counts.scheduled_tasks} task${counts.scheduled_tasks > 1 ? "s" : ""} scheduled`
            : "Automate recurring agent tasks"}
          icon={CalendarClock}
          actionLabel="View"
          onAction={() => navigate("tasks")}
        />
      </div>

      {/* Members section */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Members</h2>
        </div>
        <div className="rounded-xl border border-border/50 divide-y divide-border/50">
          {project.members.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                  {member.email.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm truncate">{member.email}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColor(member.role)}`}>
                  {member.role}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {relativeTime(member.joined_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface OverviewCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  actionLabel: string;
  onAction: () => void;
}

function OverviewCard({ title, description, icon: Icon, actionLabel, onAction }: OverviewCardProps) {
  return (
    <div className="rounded-xl border border-border/50 p-5 flex flex-col justify-between min-h-[140px] hover:border-border transition-colors">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={onAction} className="text-xs">
          {actionLabel}
        </Button>
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
