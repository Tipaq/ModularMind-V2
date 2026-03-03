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
  Input,
} from "@modularmind/ui";
import type { LocalSettings } from "@modularmind/api-client";
import { api } from "../../lib/api";

// ─── Provider icons (inline SVGs) ───────────────────────────────────────────

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.476-4.082H5.417L3.94 20.48H.333L6.57 3.52zM9.9 13.567l-2.607-7.07-2.56 7.07H9.9z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

function MistralIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="0" y="0" width="5" height="5" />
      <rect x="9.5" y="0" width="5" height="5" />
      <rect x="19" y="0" width="5" height="5" />
      <rect x="0" y="4.75" width="5" height="5" />
      <rect x="4.75" y="4.75" width="5" height="5" />
      <rect x="9.5" y="4.75" width="5" height="5" />
      <rect x="19" y="4.75" width="5" height="5" />
      <rect x="0" y="9.5" width="5" height="5" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <rect x="14.25" y="9.5" width="5" height="5" />
      <rect x="19" y="9.5" width="5" height="5" />
      <rect x="0" y="14.25" width="5" height="5" />
      <rect x="4.75" y="14.25" width="5" height="5" />
      <rect x="9.5" y="14.25" width="5" height="5" />
      <rect x="19" y="14.25" width="5" height="5" />
      <rect x="0" y="19" width="5" height="5" />
      <rect x="9.5" y="19" width="5" height="5" />
      <rect x="19" y="19" width="5" height="5" />
    </svg>
  );
}

function CohereIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function GroqIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

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

export default function ProvidersTab() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<LocalSettings>("/internal/settings");
        setSettings(data);
      } catch {
        /* settings may not be available yet */
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

  const handleRemove = async (providerKey: string) => {
    if (
      !confirm(
        `Remove the ${PROVIDERS.find((p) => p.key === providerKey)?.name} API key?`,
      )
    )
      return;

    setSaving(providerKey);
    try {
      const data = await api.patch<LocalSettings>("/internal/settings", {
        llm_api_keys: { [providerKey]: "" },
      });
      setSettings(data);
      setSaveSuccess(providerKey);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch {
      /* ignore */
    }
    setSaving(null);
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
                        onClick={() => handleRemove(key)}
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
    </div>
  );
}
