import { useEffect, useState } from "react";
import {
  RefreshCw,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  Save,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  Button,
  Badge,
  ConfirmDialog,
  Input,
} from "@modularmind/ui";
import type { LocalSettings } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import {
  OpenAIIcon,
  AnthropicIcon,
  GoogleIcon,
  MistralIcon,
  CohereIcon,
  GroqIcon,
} from "./provider-icons";

// ─── Provider definitions ───────────────────────────────────────────────────

interface ProviderDef {
  key: string;
  name: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  description: string;
  docUrl: string;
  setupSteps: string[];
  keyPlaceholder: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    key: "openai",
    name: "OpenAI",
    icon: OpenAIIcon,
    color: "bg-success",
    description: "GPT-4o, GPT-4o-mini, o1, o3 and other OpenAI models",
    docUrl: "https://platform.openai.com/api-keys",
    setupSteps: [
      "Go to platform.openai.com and sign in or create an account",
      "Navigate to API Keys in the left sidebar",
      'Click "Create new secret key" and copy it',
      "Paste the key below and click Save",
    ],
    keyPlaceholder: "sk-...",
  },
  {
    key: "anthropic",
    name: "Anthropic",
    icon: AnthropicIcon,
    color: "bg-warning",
    description: "Claude Opus, Sonnet, Haiku models",
    docUrl: "https://console.anthropic.com/settings/keys",
    setupSteps: [
      "Go to console.anthropic.com and sign in or create an account",
      "Navigate to Settings > API Keys",
      'Click "Create Key", name it, and copy the key',
      "Paste the key below and click Save",
    ],
    keyPlaceholder: "sk-ant-...",
  },
  {
    key: "google",
    name: "Google AI",
    icon: GoogleIcon,
    color: "bg-info",
    description: "Gemini 2.0, Gemini 1.5 Pro/Flash models",
    docUrl: "https://aistudio.google.com/apikey",
    setupSteps: [
      "Go to aistudio.google.com and sign in with your Google account",
      'Click "Get API key" in the top navigation',
      "Create a new key or copy an existing one",
      "Paste the key below and click Save",
    ],
    keyPlaceholder: "AI...",
  },
  {
    key: "mistral",
    name: "Mistral",
    icon: MistralIcon,
    color: "bg-accent",
    description: "Mistral Large, Medium, Small, Codestral models",
    docUrl: "https://console.mistral.ai/api-keys/",
    setupSteps: [
      "Go to console.mistral.ai and sign in or create an account",
      "Navigate to API Keys from the menu",
      'Click "Create new key" and copy it',
      "Paste the key below and click Save",
    ],
    keyPlaceholder: "Enter API key...",
  },
  {
    key: "cohere",
    name: "Cohere",
    icon: CohereIcon,
    color: "bg-secondary",
    description: "Command R+, Command R, Embed models",
    docUrl: "https://dashboard.cohere.com/api-keys",
    setupSteps: [
      "Go to dashboard.cohere.com and sign in or create an account",
      "Navigate to API Keys",
      "Copy your default key or create a new one",
      "Paste the key below and click Save",
    ],
    keyPlaceholder: "Enter API key...",
  },
  {
    key: "groq",
    name: "Groq",
    icon: GroqIcon,
    color: "bg-primary",
    description: "Llama, Mixtral, Gemma models via Groq inference",
    docUrl: "https://console.groq.com/keys",
    setupSteps: [
      "Go to console.groq.com and sign in or create an account",
      "Navigate to API Keys",
      'Click "Create API Key" and copy it',
      "Paste the key below and click Save",
    ],
    keyPlaceholder: "gsk_...",
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ProvidersTab() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<LocalSettings>("/internal/settings");
        setSettings(data);
      } catch (err) {
        console.warn("[ProvidersTab] settings not available:", err);
      }
      setLoading(false);
    })();
  }, []);

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async (providerKey: string) => {
    const value = apiKeys[providerKey]?.trim();
    if (!value) return;

    setSaving(providerKey);
    setSaveError(null);

    try {
      const data = await api.patch<LocalSettings>("/internal/settings", {
        llm_api_keys: { [providerKey]: value },
      });
      setSettings(data);
      setApiKeys((prev) => ({ ...prev, [providerKey]: "" }));
      setVisibleKeys((prev) => {
        const next = new Set(prev);
        next.delete(providerKey);
        return next;
      });
      setSaveSuccess(providerKey);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch {
      setSaveError(providerKey);
      setTimeout(() => setSaveError(null), 3000);
    }
    setSaving(null);
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    setSaving(removeTarget);
    try {
      const data = await api.patch<LocalSettings>("/internal/settings", {
        llm_api_keys: { [removeTarget]: "" },
      });
      setSettings(data);
      setSaveSuccess(removeTarget);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      console.error("[ProvidersTab] remove key:", err);
    }
    setSaving(null);
    setRemoveTarget(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        API keys are encrypted and stored locally on your instance. They are
        never sent to the platform.
      </p>

      {PROVIDERS.map((provider) => {
        const {
          key,
          name,
          icon: Icon,
          color,
          description,
          docUrl,
          setupSteps,
          keyPlaceholder,
        } = provider;
        const isExpanded = expandedKey === key;
        const isConfigured = !!(settings?.llm_api_keys[key]);
        const isVisible = visibleKeys.has(key);
        const isSaving = saving === key;
        const hasNewValue = !!(apiKeys[key]?.trim());

        return (
          <Card key={key} className="overflow-hidden">
            {/* Card header */}
            <button
              className="w-full text-left"
              onClick={() => setExpandedKey(isExpanded ? null : key)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{name}</p>
                        {isConfigured ? (
                          <Badge variant="success">Configured</Badge>
                        ) : (
                          <Badge variant="secondary">Not configured</Badge>
                        )}
                        {saveSuccess === key && (
                          <span className="flex items-center gap-0.5 text-xs text-success">
                            <Check className="h-3 w-3" /> Saved
                          </span>
                        )}
                        {saveError === key && (
                          <span className="flex items-center gap-0.5 text-xs text-destructive">
                            <X className="h-3 w-3" /> Error
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </button>

            {/* Expanded panel */}
            {isExpanded && (
              <div className="border-t px-4 pb-4">
                <div className="mt-4 rounded-lg border border-dashed p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {isConfigured ? "Update API key" : "Setup guide"}
                    </p>
                    <a
                      href={docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Get API key
                    </a>
                  </div>

                  <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                    {setupSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>

                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        API Key <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Input
                          type={isVisible ? "text" : "password"}
                          placeholder={
                            isConfigured ? "••••••••••••••••" : keyPlaceholder
                          }
                          value={apiKeys[key] || ""}
                          onChange={(e) =>
                            setApiKeys((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          className="text-xs h-8 pr-8"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => toggleVisibility(key)}
                        >
                          {isVisible ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleSave(key)}
                      disabled={isSaving || !hasNewValue}
                      className="h-8 text-xs"
                    >
                      {isSaving ? (
                        <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Save className="h-3 w-3 mr-1" />
                      )}
                      Save
                    </Button>
                    {isConfigured && (
                      <Button
                        variant="ghost"
                        onClick={() => setRemoveTarget(key)}
                        disabled={isSaving}
                        className="h-8 text-xs text-muted-foreground"
                        title="Remove API key"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title={`Remove ${PROVIDERS.find((p) => p.key === removeTarget)?.name} API key?`}
        description="Models from this provider will no longer be available until a new key is configured."
        confirmLabel="Remove"
        destructive
        loading={saving === removeTarget}
        onConfirm={handleRemoveConfirm}
      />
    </div>
  );
}
