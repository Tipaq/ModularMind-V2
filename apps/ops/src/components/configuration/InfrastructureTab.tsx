import { useCallback, useEffect, useState } from "react";
import { Loader2, Power, Server, Zap } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
} from "@modularmind/ui";
import { api } from "../../lib/api";

interface OllamaStatus {
  gpu_available: boolean;
  gpu_name: string | null;
  running: boolean;
  enabled: boolean;
  gpu_enabled: boolean;
  container_id: string | null;
  container_name: string | null;
  image: string | null;
}

export function InfrastructureTab() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [togglingGpu, setTogglingGpu] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<OllamaStatus>("/internal/ollama/status");
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggleOllama = async () => {
    if (!status) return;
    setToggling(true);
    try {
      if (status.running || status.enabled) {
        const data = await api.post<OllamaStatus>("/internal/ollama/stop");
        setStatus(data);
      } else {
        const data = await api.post<OllamaStatus>("/internal/ollama/start", {
          gpu_enabled: status.gpu_enabled,
        });
        setStatus(data);
      }
    } catch {
      await fetchStatus();
    } finally {
      setToggling(false);
    }
  };

  const handleToggleGpu = async () => {
    if (!status || !status.enabled) return;
    setTogglingGpu(true);
    try {
      await api.post<OllamaStatus>("/internal/ollama/stop");
      const data = await api.post<OllamaStatus>("/internal/ollama/start", {
        gpu_enabled: !status.gpu_enabled,
      });
      setStatus(data);
    } catch {
      await fetchStatus();
    } finally {
      setTogglingGpu(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Ollama</CardTitle>
                <CardDescription>Local LLM inference engine</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {status && (
                <Badge variant={status.running ? "default" : "secondary"}>
                  {status.running ? "Running" : "Stopped"}
                </Badge>
              )}
              <Switch
                checked={status?.enabled ?? false}
                onCheckedChange={handleToggleOllama}
                disabled={toggling}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {toggling && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status?.enabled ? "Stopping Ollama..." : "Starting Ollama..."}
            </div>
          )}

          {status?.enabled && (
            <div className="space-y-3">
              {status.gpu_available && (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-warning" />
                    <div>
                      <p className="text-sm font-medium">GPU Acceleration</p>
                      <p className="text-xs text-muted-foreground">
                        {status.gpu_name || "NVIDIA GPU detected"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={status.gpu_enabled}
                    onCheckedChange={handleToggleGpu}
                    disabled={togglingGpu || toggling}
                  />
                </div>
              )}

              {togglingGpu && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Restarting Ollama with {status.gpu_enabled ? "CPU" : "GPU"} mode...
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                {status.container_name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Container</p>
                    <p className="font-mono text-xs">{status.container_name}</p>
                  </div>
                )}
                {status.image && (
                  <div>
                    <p className="text-xs text-muted-foreground">Image</p>
                    <p className="font-mono text-xs">{status.image}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!status?.enabled && !toggling && (
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <Power className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Enable Ollama to run AI models locally. Models like Llama, Qwen, and Gemma will be available without cloud API keys.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleToggleOllama}
                disabled={toggling}
              >
                <Server className="h-3.5 w-3.5 mr-1.5" />
                Enable Ollama
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
