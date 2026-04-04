import { useEffect, useState } from "react";
import { RefreshCw, RefreshCcw, Bell, Shield, Cpu, Timer } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@modularmind/ui";
import type { LocalSettings } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

export function SystemTab() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.get<LocalSettings>("/internal/settings");
        setSettings(data);
      } catch (err) {
        console.warn("[SystemTab] settings not available:", err);
      }
      setLoading(false);
    })();
  }, []);

  const toggleSetting = async (key: "telemetry_enabled" | "auto_sync") => {
    if (!settings) return;
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await api.patch<LocalSettings>("/internal/settings", {
        [key]: updated[key],
      });
    } catch {
      setSettings(settings);
      setSaveError("Failed to save setting");
    }
  };

  const updateSyncInterval = async (value: string) => {
    if (!settings) return;
    const newValue = parseInt(value);
    const updated = { ...settings, sync_interval_minutes: newValue };
    setSettings(updated);
    try {
      await api.patch<LocalSettings>("/internal/settings", {
        sync_interval_minutes: newValue,
      });
    } catch {
      setSettings(settings);
      setSaveError("Failed to save setting");
    }
  };

  const updateKeepAlive = async (value: string) => {
    if (!settings) return;
    const updated = { ...settings, ollama_keep_alive: value };
    setSettings(updated);
    try {
      await api.patch<LocalSettings>("/internal/settings", {
        ollama_keep_alive: value,
      });
    } catch {
      setSettings(settings);
      setSaveError("Failed to save setting");
    }
  };

  const updateExecutionTimeout = async (value: string) => {
    if (!settings) return;
    const newValue = parseInt(value);
    const updated = { ...settings, max_execution_timeout: newValue };
    setSettings(updated);
    try {
      await api.patch<LocalSettings>("/internal/settings", {
        max_execution_timeout: newValue,
      });
    } catch {
      setSettings(settings);
      setSaveError("Failed to save setting");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {saveError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* Sync Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RefreshCcw className="h-5 w-5" />
            <CardTitle>Synchronization</CardTitle>
          </div>
          <CardDescription>
            Configure how your runtime syncs with the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto Sync</p>
              <p className="text-sm text-muted-foreground">
                Automatically sync configurations from the platform
              </p>
            </div>
            <Switch
              checked={settings?.auto_sync ?? false}
              onCheckedChange={() => toggleSetting("auto_sync")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Sync Interval (minutes)
            </label>
            <Select
              value={String(settings?.sync_interval_minutes || 5)}
              onValueChange={updateSyncInterval}
              disabled={!settings?.auto_sync}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 minute</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Ollama */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            <CardTitle>Ollama</CardTitle>
          </div>
          <CardDescription>
            Configure how Ollama manages models in GPU memory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Keep Alive (model unload timeout)
            </label>
            <Select
              value={settings?.ollama_keep_alive || "24h"}
              onValueChange={updateKeepAlive}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5m">5 minutes</SelectItem>
                <SelectItem value="30m">30 minutes</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="4h">4 hours</SelectItem>
                <SelectItem value="12h">12 hours</SelectItem>
                <SelectItem value="24h">24 hours</SelectItem>
                <SelectItem value="-1">Never unload</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How long Ollama keeps a model loaded in VRAM after the last request.
              Longer values reduce cold-start latency but use more GPU memory.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Execution */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            <CardTitle>Execution</CardTitle>
          </div>
          <CardDescription>
            Configure execution limits for agent and graph runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Max Execution Timeout
            </label>
            <Select
              value={String(settings?.max_execution_timeout || 900)}
              onValueChange={updateExecutionTimeout}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="120">2 minutes</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
                <SelectItem value="600">10 minutes</SelectItem>
                <SelectItem value="900">15 minutes</SelectItem>
                <SelectItem value="1200">20 minutes</SelectItem>
                <SelectItem value="1800">30 minutes</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Maximum time an agent or graph execution can run before being cancelled.
              Increase this if you use local models that generate slowly.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Telemetry */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Telemetry</CardTitle>
          </div>
          <CardDescription>
            Control what data is shared with the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Send Anonymous Metrics</p>
              <p className="text-sm text-muted-foreground">
                Share usage metrics to help improve the platform
              </p>
            </div>
            <Switch
              checked={settings?.telemetry_enabled ?? false}
              onCheckedChange={() => toggleSetting("telemetry_enabled")}
            />
          </div>
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">What we collect:</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li>- Execution counts and timing</li>
                  <li>- Error rates (no details)</li>
                  <li>- Token usage statistics</li>
                  <li>- System health metrics</li>
                </ul>
                <p className="mt-2 font-medium">What we never collect:</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li>- Conversation content</li>
                  <li>- User data</li>
                  <li>- RAG documents</li>
                  <li>- API keys</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
