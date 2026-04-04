import { memo, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ChevronRight,
  MessageSquare,
  BookOpen,
  AppWindow,
  CalendarClock,
  GitBranch,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import type { Project } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { useSidebarStore } from "../../stores/sidebar-store";

interface ProjectSubItem {
  label: string;
  to: string;
  icon: typeof MessageSquare;
}

function getProjectSubItems(projectId: string): ProjectSubItem[] {
  return [
    { label: "Conversations", to: `/projects/${projectId}/conversations`, icon: MessageSquare },
    { label: "Knowledge", to: `/projects/${projectId}/knowledge`, icon: BookOpen },
    { label: "Apps", to: `/projects/${projectId}/apps`, icon: AppWindow },
    { label: "Tasks", to: `/projects/${projectId}/tasks`, icon: CalendarClock },
    { label: "Repos", to: `/projects/${projectId}/repositories`, icon: GitBranch },
  ];
}

const ProjectNode = memo(function ProjectNode({ project }: { project: Project }) {
  const { expandedProjects, toggleProject } = useSidebarStore();
  const isExpanded = expandedProjects.has(project.id);
  const subItems = getProjectSubItems(project.id);

  return (
    <div>
      <NavLink
        to={`/projects/${project.id}`}
        end
        className={({ isActive }) =>
          cn(
            "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors w-full",
            isActive
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )
        }
      >
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleProject(project.id); }}
          className="shrink-0 p-0.5 rounded hover:bg-muted/80 transition-transform"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
        </button>
        {project.icon ? (
          <span className="text-sm shrink-0">{project.icon}</span>
        ) : (
          <span
            className="h-4 w-4 rounded shrink-0"
            style={{ backgroundColor: project.color || "var(--color-primary)" }}
          />
        )}
        <span className="truncate flex-1">{project.name}</span>
      </NavLink>

      {isExpanded && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/40 pl-2">
          {subItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                  isActive
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )
              }
            >
              <item.icon className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
});

export const SidebarProjects = memo(function SidebarProjects() {
  const { isCollapsed } = useSidebarStore();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let active = true;
    api.get<Project[]>("/projects")
      .then((data) => { if (active) setProjects(data); })
      .catch(() => { if (active) setProjects([]); });
    return () => { active = false; };
  }, []);

  if (isCollapsed) return null;

  if (projects.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No projects
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-1">
      {projects.map((project) => (
        <ProjectNode key={project.id} project={project} />
      ))}
    </div>
  );
});
