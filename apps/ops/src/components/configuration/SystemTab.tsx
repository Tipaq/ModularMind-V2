import { useEffect, useState } from "react";
import { RefreshCw, RefreshCcw, Bell, Shield } from "lucide-react";
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
} from "@modularmind/ui";
import type { LocalSettings } from "@modularmind/api-client";
import { api } from "../../lib/api";

export default function SystemTab() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.get<LocalSettings>("/internal/settings");
        setSettings(data);
      } catch {
        /* settings may not be available */
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
            <button
              onClick={() => toggleSetting("auto_sync")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings?.auto_sync ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings?.auto_sync ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
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
            <button
              onClick={() => toggleSetting("telemetry_enabled")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings?.telemetry_enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings?.telemetry_enabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
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
