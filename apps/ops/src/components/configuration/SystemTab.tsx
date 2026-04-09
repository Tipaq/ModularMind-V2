import { useEffect, useState } from "react";
import { Bot, Cpu, RefreshCw, Timer } from "lucide-react";
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
import type { LocalSettings, ProviderConfig } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

export function SystemTab() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [settingsData, providersData] = await Promise.all([
          api.get<LocalSettings>("/internal/settings"),
          api.get<ProviderConfig[]>("/models/providers").catch(() => []),
        ]);
        setSettings(settingsData);
        setProviders(providersData);
      } catch (err) {
        console.warn("[SystemTab] settings not available:", err);
      }
      setLoading(false);
    })();
  }, []);

  const updateSetting = async (patch: Partial<LocalSettings>) => {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    setSettings(updated);
    try {
      await api.patch<LocalSettings>("/internal/settings", patch);
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

  const configuredProviders = providers.filter((p) => p.is_configured);

  return (
    <>
      {saveError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Default Provider</CardTitle>
              <CardDescription>Provider used when no model is explicitly set</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Select
            value={settings?.default_model || "ollama"}
            onValueChange={(v) => updateSetting({ default_model: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {configuredProviders.map((p) => (
                <SelectItem key={p.provider} value={p.provider}>
                  {p.name}
                </SelectItem>
              ))}
              {!configuredProviders.some((p) => p.provider === "ollama") && (
                <SelectItem value="ollama">Ollama</SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            Only configured providers are listed. Add API keys in the Providers tab.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Cpu className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Ollama Keep Alive</CardTitle>
              <CardDescription>How long models stay loaded in GPU memory</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Select
            value={settings?.ollama_keep_alive || "24h"}
            onValueChange={(v) => updateSetting({ ollama_keep_alive: v })}
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
          <p className="mt-2 text-xs text-muted-foreground">
            Longer values reduce cold-start latency but use more GPU memory.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Execution Timeout</CardTitle>
              <CardDescription>Max runtime for agent and graph executions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Select
            value={String(settings?.max_execution_timeout || 900)}
            onValueChange={(v) => updateSetting({ max_execution_timeout: parseInt(v) })}
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
          <p className="mt-2 text-xs text-muted-foreground">
            Increase this if you use local models that generate slowly.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
