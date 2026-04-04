import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderKanban, Plus, RefreshCw, Search } from "lucide-react";
import { Badge, Button, EmptyState, Input } from "@modularmind/ui";
import type { Project } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { CreateProjectDialog } from "../../components/projects/CreateProjectDialog";

export function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Project[]>("/projects");
      setProjects(data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const lower = search.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(lower)
        || (p.description?.toLowerCase().includes(lower) ?? false),
    );
  }, [projects, search]);

  const handleCreate = useCallback(async (data: { name: string; description: string }) => {
    const created = await api.post<Project>("/projects", data);
    setProjects((prev) => [...prev, created]);
    navigate(`/projects/${created.id}`);
  }, [navigate]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Organize your conversations, knowledge, apps, and tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filtered.length} projects</Badge>
          <Button variant="ghost" size="sm" onClick={loadProjects} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New Project
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={search ? "No projects match your search" : "No projects yet"}
          description="Create a project to organize your work."
          action={
            !search ? (
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Your First Project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
      />
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-border/50 bg-card/50 p-4 cursor-pointer transition-colors hover:bg-muted/30"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          {project.icon ? (
            <span className="text-lg">{project.icon}</span>
          ) : (
            <FolderKanban className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sm truncate">{project.name}</h3>
          {project.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{project.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {project.member_count} {project.member_count === 1 ? "member" : "members"}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectList;
