import { useEffect, useState } from "react";
import { RefreshCw, Settings } from "lucide-react";
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
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const configuredProviders = providers.filter((p) => p.is_configured);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Runtime Settings</CardTitle>
            <CardDescription>Default provider, timeouts, and model memory</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {saveError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {saveError}
          </div>
        )}

        <SettingRow
          label="Default Provider"
          hint="Used when no model is explicitly set"
        >
          <Select
            value={settings?.default_model || "ollama"}
            onValueChange={(v) => updateSetting({ default_model: v })}
          >
            <SelectTrigger className="w-48">
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
        </SettingRow>

        <SettingRow
          label="Ollama Keep Alive"
          hint="How long models stay loaded in VRAM"
        >
          <Select
            value={settings?.ollama_keep_alive || "24h"}
            onValueChange={(v) => updateSetting({ ollama_keep_alive: v })}
          >
            <SelectTrigger className="w-48">
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
        </SettingRow>

        <SettingRow
          label="Execution Timeout"
          hint="Max runtime for agent and graph runs"
        >
          <Select
            value={String(settings?.max_execution_timeout || 900)}
            onValueChange={(v) => updateSetting({ max_execution_timeout: parseInt(v) })}
          >
            <SelectTrigger className="w-48">
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
        </SettingRow>
      </CardContent>
    </Card>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}
