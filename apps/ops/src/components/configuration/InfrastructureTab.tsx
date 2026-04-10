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
import { api } from "@modularmind/api-client";
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
      setBridgeStatus(await api.get<ClaudeBridgeStatus>("/internal/debug/claude/status"));
    } catch {
      setBridgeStatus(null);
    } finally {
      setBridgeLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await api.get<OllamaStatus>("/internal/ollama/status"));
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
        setStatus(await api.post<OllamaStatus>("/internal/ollama/stop"));
      } else {
        setStatus(await api.post<OllamaStatus>("/internal/ollama/start", {
          gpu_enabled: status.gpu.ready && status.gpu_enabled,
        }));
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
      setStatus(await api.post<OllamaStatus>("/internal/ollama/start", {
        gpu_enabled: !status.gpu_enabled,
      }));
    } catch {
      await fetchStatus();
    } finally {
      setTogglingGpu(false);
    }
  };

  const handleSyncCredentials = async () => {
    setSyncing(true);
    setSyncSuccess(false);
    try {
      await api.post("/internal/debug/claude/sync-credentials");
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
      await fetchBridgeStatus();
    } catch { /* ignore */ } finally {
      setSyncing(false);
    }
  };

  const handleStartAuth = async () => {
    setAuthOutput("Starting authentication...");
    try {
      const data = await api.post<{ auth_url: string | null; output: string }>(
        "/internal/debug/claude/auth",
      );
      if (data.auth_url) {
        window.open(data.auth_url, "_blank");
        setAuthOutput("Login page opened — complete authentication in the new tab, then refresh.");
      } else {
        setAuthOutput(data.output);
      }
    } catch {
      setAuthOutput("Failed to start auth flow");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <OllamaCard
        status={status}
        toggling={toggling}
        togglingGpu={togglingGpu}
        onToggle={handleToggleOllama}
        onToggleGpu={handleToggleGpu}
      />

      {status?.gpu && <GpuCard gpu={status.gpu} />}

      <ClaudeBridgeCard
        status={bridgeStatus}
        loading={bridgeLoading}
        syncing={syncing}
        syncSuccess={syncSuccess}
        authOutput={authOutput}
        onSync={handleSyncCredentials}
        onAuth={handleStartAuth}
      />
    </>
  );
}

function OllamaCard({
  status,
  toggling,
  togglingGpu,
  onToggle,
  onToggleGpu,
}: {
  status: OllamaStatus | null;
  toggling: boolean;
  togglingGpu: boolean;
  onToggle: () => void;
  onToggleGpu: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
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
          <div className="flex items-center gap-2">
            {status && (
              <Badge variant={status.running ? "default" : "secondary"} className="text-xs">
                {status.running ? "Running" : "Stopped"}
              </Badge>
            )}
            <Switch
              checked={status?.enabled ?? false}
              onCheckedChange={onToggle}
              disabled={toggling}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {toggling && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {status?.enabled ? "Stopping..." : "Starting..."}
          </div>
        )}

        {status?.enabled && (
          <div className="space-y-2">
            {status.gpu.ready && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-warning" />
                  <span className="text-sm">GPU Acceleration</span>
                  <span className="text-xs text-muted-foreground">
                    {status.gpu.hardware_name}
                  </span>
                </div>
                <Switch
                  checked={status.gpu_enabled}
                  onCheckedChange={onToggleGpu}
                  disabled={togglingGpu || toggling}
                />
              </div>
            )}
            {togglingGpu && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Restarting with {status.gpu_enabled ? "CPU" : "GPU"} mode...
              </div>
            )}
            <div className="flex gap-4 text-xs text-muted-foreground">
              {status.container_name && (
                <span>Container: <span className="font-mono">{status.container_name}</span></span>
              )}
              {status.image && (
                <span>Image: <span className="font-mono">{status.image}</span></span>
              )}
            </div>
          </div>
        )}

        {!status?.enabled && !toggling && (
          <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-3">
            <Power className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">Enable Ollama to run AI models locally.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GpuCard({ gpu }: { gpu: GpuInfo }) {
  if (gpu.ready) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Monitor className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-medium">GPU Ready</p>
              <p className="text-xs text-muted-foreground">
                {gpu.hardware_name} — Driver {gpu.driver_version}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!gpu.hardware_detected) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No GPU detected</p>
              <p className="text-xs text-muted-foreground">Ollama will run on CPU</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const steps = [
    { label: "NVIDIA Hardware", done: gpu.hardware_detected, detail: gpu.hardware_name },
    {
      label: "NVIDIA Drivers",
      done: gpu.drivers_installed,
      detail: gpu.drivers_installed ? `v${gpu.driver_version}` : null,
      command: "sudo apt install -y nvidia-driver-560 && sudo reboot",
    },
    {
      label: "Container Toolkit",
      done: gpu.toolkit_installed,
      command: "curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list && sudo apt update && sudo apt install -y nvidia-container-toolkit && sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <div>
            <CardTitle className="text-base">GPU Setup Required</CardTitle>
            <CardDescription>{gpu.hardware_name} detected but not fully configured</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
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
              {step.detail && <span className="text-[10px] text-muted-foreground">{step.detail}</span>}
            </div>
            {!step.done && step.command && (
              <div className="ml-5.5 rounded bg-muted/80 px-2 py-1">
                <code className="text-[10px] text-muted-foreground break-all select-all">
                  {step.command}
                </code>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ClaudeBridgeCard({
  status,
  loading,
  syncing,
  syncSuccess,
  authOutput,
  onSync,
  onAuth,
}: {
  status: ClaudeBridgeStatus | null;
  loading: boolean;
  syncing: boolean;
  syncSuccess: boolean;
  authOutput: string | null;
  onSync: () => void;
  onAuth: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
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
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status?.available ? (
            <Badge variant={status.authenticated ? "default" : "warning"} className="text-xs">
              {status.authenticated
                ? status.credentials_synced ? "Ready" : "Needs sync"
                : "Needs auth"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Inactive</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!status?.available && !loading && (
          <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-3">
            <Server className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="text-sm text-muted-foreground">
              Not running. Start with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                docker compose --profile debug up -d
              </code>
            </div>
          </div>
        )}

        {status?.available && !status.authenticated && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
              <span className="text-sm">Authentication required</span>
            </div>
            <Button onClick={onAuth} size="sm" className="w-full">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Authenticate with Claude Max
            </Button>
            {authOutput && (
              <code className="block rounded-md bg-muted/80 px-2 py-1.5 text-xs break-all select-all whitespace-pre-wrap">
                {authOutput}
              </code>
            )}
          </div>
        )}

        {status?.available && status.authenticated && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
              <span className="text-sm">Connected — {status.subscription} subscription</span>
            </div>
            <Button
              onClick={onSync}
              disabled={syncing}
              variant={status.credentials_synced ? "outline" : "default"}
              size="sm"
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
                : status.credentials_synced ? "Re-sync credentials" : "Sync credentials"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
