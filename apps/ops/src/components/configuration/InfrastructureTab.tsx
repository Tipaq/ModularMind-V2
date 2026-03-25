import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Monitor,
  Power,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
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
import { AnthropicIcon } from "./provider-icons";

interface GpuInfo {
  hardware_detected: boolean;
  hardware_name: string | null;
  drivers_installed: boolean;
  driver_version: string | null;
  toolkit_installed: boolean;
  ready: boolean;
}

interface OllamaStatus {
  running: boolean;
  enabled: boolean;
  gpu_enabled: boolean;
  gpu: GpuInfo;
  container_id: string | null;
  container_name: string | null;
  image: string | null;
}

function GpuSetupCard({ gpu }: { gpu: GpuInfo }) {
  if (!gpu.hardware_detected) return null;

  if (gpu.ready) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-sm font-medium">GPU Ready</span>
        </div>
        <p className="text-xs text-muted-foreground ml-6">
          {gpu.hardware_name} — Driver {gpu.driver_version}
        </p>
      </div>
    );
  }

  const steps = [
    {
      label: "NVIDIA Hardware",
      done: gpu.hardware_detected,
      detail: gpu.hardware_name,
    },
    {
      label: "NVIDIA Drivers",
      done: gpu.drivers_installed,
      detail: gpu.drivers_installed ? `v${gpu.driver_version}` : null,
      command: "sudo apt install -y nvidia-driver-560 && sudo reboot",
    },
    {
      label: "Container Toolkit",
      done: gpu.toolkit_installed,
      command:
        "curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list && sudo apt update && sudo apt install -y nvidia-container-toolkit && sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker",
    },
  ];

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="text-sm font-medium">GPU Setup Required</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {gpu.hardware_name} detected but not fully configured.
        Complete the steps below on your server:
      </p>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.label} className="space-y-1">
            <div className="flex items-center gap-2">
              {step.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
              )}
              <span className={`text-xs font-medium ${step.done ? "text-muted-foreground" : ""}`}>
                {step.label}
              </span>
              {step.detail && (
                <span className="text-[10px] text-muted-foreground">{step.detail}</span>
              )}
            </div>
            {!step.done && step.command && (
              <div className="ml-5.5 rounded bg-muted/80 px-2.5 py-1.5">
                <code className="text-[10px] text-muted-foreground break-all select-all">
                  {step.command}
                </code>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ClaudeBridgeStatus {
  available: boolean;
  authenticated: boolean;
  subscription: string | null;
  status: string;
  credentials_synced: boolean;
}

export function InfrastructureTab() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [togglingGpu, setTogglingGpu] = useState(false);

  const [bridgeStatus, setBridgeStatus] = useState<ClaudeBridgeStatus | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [authOutput, setAuthOutput] = useState<string | null>(null);

  const fetchBridgeStatus = useCallback(async () => {
    try {
      const data = await api.get<ClaudeBridgeStatus>("/internal/debug/claude/status");
      setBridgeStatus(data);
    } catch {
      setBridgeStatus(null);
    } finally {
      setBridgeLoading(false);
    }
  }, []);

  const handleSyncCredentials = async () => {
    setSyncing(true);
    setSyncSuccess(false);
    try {
      await api.post("/internal/debug/claude/sync-credentials");
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
      await fetchBridgeStatus();
    } catch {
      /* ignore */
    } finally {
      setSyncing(false);
    }
  };

  const handleStartAuth = async () => {
    try {
      const data = await api.post<{ output: string }>("/internal/debug/claude/auth");
      setAuthOutput(data.output);
    } catch {
      setAuthOutput("Failed to start auth flow");
    }
  };

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
    fetchBridgeStatus();
  }, [fetchStatus, fetchBridgeStatus]);

  const handleToggleOllama = async () => {
    if (!status) return;
    setToggling(true);
    try {
      if (status.running || status.enabled) {
        const data = await api.post<OllamaStatus>("/internal/ollama/stop");
        setStatus(data);
      } else {
        const data = await api.post<OllamaStatus>("/internal/ollama/start", {
          gpu_enabled: status.gpu.ready && status.gpu_enabled,
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
              {status.gpu.ready && (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-warning" />
                    <div>
                      <p className="text-sm font-medium">GPU Acceleration</p>
                      <p className="text-xs text-muted-foreground">
                        {status.gpu.hardware_name} — Driver {status.gpu.driver_version}
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
                Enable Ollama to run AI models locally.
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

      {/* GPU Setup Card — show when hardware detected but not fully ready */}
      {status?.gpu && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <Monitor className="h-5 w-5 text-warning" />
              </div>
              <div>
                <CardTitle className="text-base">GPU</CardTitle>
                <CardDescription>NVIDIA GPU acceleration for faster inference</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <GpuSetupCard gpu={status.gpu} />
            {!status.gpu.hardware_detected && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center py-2">
                  No NVIDIA GPU runtime detected. Ollama will run on CPU.
                </p>
                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                  <p className="text-xs font-medium">Have a GPU? Install drivers and toolkit on your server:</p>
                  <div className="space-y-1.5">
                    <div className="rounded bg-muted/80 px-2.5 py-1.5">
                      <code className="text-[10px] text-muted-foreground break-all select-all">
                        sudo apt install -y nvidia-driver-560 && sudo reboot
                      </code>
                    </div>
                    <div className="rounded bg-muted/80 px-2.5 py-1.5">
                      <code className="text-[10px] text-muted-foreground break-all select-all">
                        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list && sudo apt update && sudo apt install -y nvidia-container-toolkit && sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
                      </code>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">After installing, refresh this page to detect the GPU.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Claude Bridge — Debug sidecar for Claude Max inference */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <AnthropicIcon className="h-5 w-5 text-warning" />
              </div>
              <div>
                <CardTitle className="text-base">Claude Bridge</CardTitle>
                <CardDescription>Use Claude models via your Max subscription</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {bridgeLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : bridgeStatus?.available ? (
                <Badge variant={bridgeStatus.authenticated ? "default" : "warning"}>
                  {bridgeStatus.authenticated
                    ? bridgeStatus.credentials_synced
                      ? "Ready"
                      : "Needs sync"
                    : "Needs auth"}
                </Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!bridgeStatus?.available && !bridgeLoading && (
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <Server className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Claude Bridge is not running.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Start your server with{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  docker compose --profile debug up -d
                </code>
              </p>
            </div>
          )}

          {bridgeStatus?.available && !bridgeStatus.authenticated && (
            <div className="space-y-3">
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium">Authentication required</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect your Anthropic Max account to use Claude models.
                </p>
              </div>
              <Button onClick={handleStartAuth} className="w-full">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Authenticate with Claude Max
              </Button>
              {authOutput && (
                <div className="rounded-lg bg-muted/80 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Auth output:</p>
                  <code className="text-xs break-all select-all whitespace-pre-wrap">
                    {authOutput}
                  </code>
                </div>
              )}
            </div>
          )}

          {bridgeStatus?.available && bridgeStatus.authenticated && (
            <div className="space-y-3">
              <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium">
                    Connected — {bridgeStatus.subscription} subscription
                  </span>
                </div>
                {bridgeStatus.credentials_synced && (
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    Claude models are available in your chats.
                  </p>
                )}
              </div>

              <Button
                onClick={handleSyncCredentials}
                disabled={syncing}
                variant={bridgeStatus.credentials_synced ? "outline" : "default"}
                className="w-full"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : syncSuccess ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-success" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                {syncSuccess
                  ? "Credentials synced"
                  : bridgeStatus.credentials_synced
                    ? "Re-sync credentials"
                    : "Sync credentials to enable Claude models"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
