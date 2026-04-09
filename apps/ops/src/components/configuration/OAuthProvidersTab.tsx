"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, RefreshCw, Save, Check } from "lucide-react";
import {
  Card, CardContent, Button, Badge, Input, Label,
} from "@modularmind/ui";
import { api } from "@modularmind/api-client";

interface OAuthProviderStatus {
  provider_id: string;
  name: string;
  configured: boolean;
}

const PROVIDER_META: Record<string, { callbackPath: string; docUrl: string; steps: string[] }> = {
  google: {
    callbackPath: "/api/v1/connectors/oauth/callback/google",
    docUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "Go to Google Cloud Console > APIs & Services > Credentials",
      "Create or select an OAuth 2.0 Client ID (Web application)",
      "Add your Authorized redirect URI (shown below)",
      "Copy the Client ID and Client Secret here",
    ],
  },
  microsoft: {
    callbackPath: "/api/v1/connectors/oauth/callback/microsoft",
    docUrl: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    steps: [
      "Go to Azure Portal > App registrations > New registration",
      "Account types: Accounts in any org + personal Microsoft accounts",
      "Add the Redirect URI (shown below) as Web platform",
      "Go to Certificates & secrets > New client secret",
      "Copy the Application (client) ID and Secret value here",
    ],
  },
};

export function OAuthProvidersTab() {
  const [providers, setProviders] = useState<OAuthProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, { client_id: string; client_secret: string }>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<OAuthProviderStatus[]>("/connectors/oauth-config");
      setProviders(Array.isArray(data) ? data : []);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  const handleSave = async (providerId: string) => {
    const form = formData[providerId];
    if (!form?.client_id || !form?.client_secret) return;

    setSaving(providerId);
    try {
      const params = new URLSearchParams({
        client_id: form.client_id,
        client_secret: form.client_secret,
      });
      await api.put(`/connectors/oauth-config/${providerId}?${params.toString()}`, {});
      setSaved(providerId);
      setTimeout(() => setSaved(null), 2000);
      await loadProviders();
      setFormData((prev) => ({ ...prev, [providerId]: { client_id: "", client_secret: "" } }));
    } catch {
      /* silently fail */
    } finally {
      setSaving(null);
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">OAuth Providers</h2>
        <p className="text-sm text-muted-foreground">
          Configure OAuth apps so end users can connect their Google/Microsoft accounts with one click.
        </p>
      </div>

      {providers.map((provider) => {
        const meta = PROVIDER_META[provider.provider_id];
        const callbackUrl = meta ? `${baseUrl}${meta.callbackPath}` : "";
        const form = formData[provider.provider_id] || { client_id: "", client_secret: "" };
        const secretKey = `secret-${provider.provider_id}`;
        const isSecretVisible = visibleSecrets.has(secretKey);

        return (
          <Card key={provider.provider_id}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{provider.name}</p>
                  <Badge variant={provider.configured ? "success" : "secondary"}>
                    {provider.configured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                {meta?.docUrl && (
                  <a
                    href={meta.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Open console
                  </a>
                )}
              </div>

              {meta && (
                <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                  {meta.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}

              {callbackUrl && (
                <div className="space-y-1">
                  <Label className="text-xs">Redirect URI (copy this to your OAuth app)</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted px-3 py-1.5 rounded select-all">
                      {callbackUrl}
                    </code>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Client ID</Label>
                  <Input
                    placeholder={provider.configured ? "••••••• (already set)" : "Paste client ID"}
                    value={form.client_id}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        [provider.provider_id]: { ...form, client_id: e.target.value },
                      }))
                    }
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client Secret</Label>
                  <div className="relative">
                    <Input
                      type={isSecretVisible ? "text" : "password"}
                      placeholder={provider.configured ? "••••••• (already set)" : "Paste client secret"}
                      value={form.client_secret}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          [provider.provider_id]: { ...form, client_secret: e.target.value },
                        }))
                      }
                      className="text-xs h-8 pr-8"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setVisibleSecrets((prev) => {
                          const next = new Set(prev);
                          if (next.has(secretKey)) next.delete(secretKey);
                          else next.add(secretKey);
                          return next;
                        });
                      }}
                    >
                      {isSecretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => handleSave(provider.provider_id)}
                disabled={!form.client_id || !form.client_secret || saving === provider.provider_id}
                className="h-8 text-xs"
              >
                {saved === provider.provider_id ? (
                  <><Check className="h-3 w-3 mr-1" /> Saved</>
                ) : saving === provider.provider_id ? (
                  <><RefreshCw className="h-3 w-3 animate-spin mr-1" /> Saving...</>
                ) : (
                  <><Save className="h-3 w-3 mr-1" /> Save Credentials</>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
