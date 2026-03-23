import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { AppWindow } from "lucide-react";
import { EmptyState, MiniAppCard } from "@modularmind/ui";
import type { MiniApp, MiniAppListResponse, ProjectDetail } from "@modularmind/api-client";
import { api } from "../../lib/api";

interface ProjectContext {
  project: ProjectDetail;
}

export function ProjectApps() {
  const { project } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<MiniAppListResponse>(
        `/mini-apps?project_id=${project.id}&page_size=100`,
      );
      setApps(data.items ?? []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { loadApps(); }, [loadApps]);

  if (loading) {
    return (
      <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState
          icon={AppWindow}
          title="No mini-apps in this project"
          description="Assign apps to this project from the Apps page."
        />
      </div>
    );
  }

  return (
    <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {apps.map((app) => (
        <MiniAppCard
          key={app.id}
          id={app.id}
          name={app.name}
          description={app.description}
          scope={app.scope}
          icon={app.icon}
          version={app.version}
          agentId={app.agent_id}
          onClick={(id) => navigate(`/apps/${id}`)}
        />
      ))}
    </div>
  );
}

export default ProjectApps;
