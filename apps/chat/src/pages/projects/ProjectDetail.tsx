import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BookOpen, CalendarClock, FolderKanban, Loader2,
  MessageSquare, LayoutDashboard, AppWindow,
} from "lucide-react";
import { Badge, Button } from "@modularmind/ui";
import type { ProjectDetail as ProjectDetailType, ProjectResourceCounts } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

const SUB_TABS = [
  { label: "Overview", to: "", icon: LayoutDashboard, end: true },
  { label: "Conversations", to: "conversations", icon: MessageSquare },
  { label: "Knowledge", to: "knowledge", icon: BookOpen },
  { label: "Apps", to: "apps", icon: AppWindow },
  { label: "Tasks", to: "tasks", icon: CalendarClock },
];

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetailType | null>(null);
  const [resourceCounts, setResourceCounts] = useState<ProjectResourceCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [proj, counts] = await Promise.all([
        api.get<ProjectDetailType>(`/projects/${projectId}`),
        api.get<ProjectResourceCounts>(`/projects/${projectId}/resources`),
      ]);
      setProject(proj);
      setResourceCounts(counts);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Project not found</p>
        <Button variant="outline" onClick={() => navigate("/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b px-6 pt-4 pb-0 space-y-3 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {project.icon ? (
              <span className="text-lg">{project.icon}</span>
            ) : (
              <FolderKanban className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold truncate">{project.name}</h1>
            {project.description && (
              <p className="text-xs text-muted-foreground truncate">{project.description}</p>
            )}
          </div>
          <Badge variant="outline">
            {project.member_count} {project.member_count === 1 ? "member" : "members"}
          </Badge>
        </div>

        <nav className="flex items-center gap-1 -mb-px overflow-x-auto">
          {SUB_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Outlet context={{ project, resourceCounts, reload: loadProject }} />
      </div>
    </div>
  );
}

export default ProjectDetail;
