import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button, MiniAppViewer } from "@modularmind/ui";
import type { MiniApp } from "@modularmind/api-client";
import { api } from "../../lib/api";

export function AppView() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(true);

  const loadApp = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const data = await api.get<MiniApp>(`/mini-apps/${appId}`);
      setApp(data);
    } catch {
      setApp(null);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => { loadApp(); }, [loadApp]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">App not found</p>
        <Button variant="outline" onClick={() => navigate("/apps")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Apps
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 border-b flex items-center gap-3 px-4 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate("/apps")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{app.name}</p>
          <p className="text-xs text-muted-foreground">v{app.version}</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <MiniAppViewer
          appId={app.id}
          appUrl={`/api/v1/mini-apps/${app.id}/serve/${app.entry_file}`}
          appName={app.name}
          onClose={() => navigate("/apps")}
        />
      </div>
    </div>
  );
}

export default AppView;
