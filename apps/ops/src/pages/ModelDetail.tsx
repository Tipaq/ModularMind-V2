import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Box,
  Cloud,
  Cpu,
  Download,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge, Button, Separator, Slider, cn, DetailHeader } from "@modularmind/ui";
import { PROVIDER_INFO } from "@modularmind/api-client";
import type { CatalogModel } from "@modularmind/api-client";
import { ModelStatusBadge } from "../components/shared/ModelStatusBadge";
import { useModelsStore } from "../stores/models";
import { api } from "../lib/api";

// ---------------------------------------------------------------------------
// Section / PropRow — consistent with agent detail page
// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ModelDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const modelId = params.id as string;

  const { catalogModels, fetchCatalog, isProviderConfigured, triggerPull, removeFromCatalog } =
    useModelsStore();

  const [model, setModel] = useState<CatalogModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPulling, setIsPulling] = useState(false);

  // Playground parameter state
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokensOverride, setMaxTokensOverride] = useState<number | null>(null);
  const maxTokens = maxTokensOverride ?? model?.max_output_tokens ?? 4096;
  const [systemPrompt, setSystemPrompt] = useState("");

  // Load model
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      let found = catalogModels.find((m) => m.id === modelId) ?? null;

      if (!found) {
        try {
          await fetchCatalog(1);
        } catch (err) {
          console.warn("[ModelDetail] catalog fetch:", err);
        }
        found =
          useModelsStore.getState().catalogModels.find((m) => m.id === modelId) ?? null;
      }

      if (!found) {
        try {
          found = await api.get<CatalogModel>(`/models/catalog/${modelId}`);
        } catch {
          setError("Model not found");
        }
      }

      setModel(found);
      setIsLoading(false);
    }
    load();
  }, [modelId, catalogModels, fetchCatalog]);

  // Auto-refresh while pulling to track progress
  useEffect(() => {
    if (!model || model.pull_status !== "downloading") return;
    const interval = setInterval(async () => {
      try {
        const refreshed = await api.get<CatalogModel>(`/models/catalog/${modelId}`);
        setModel(refreshed);
        if (refreshed.pull_status !== "downloading") {
          setIsPulling(false);
        }
      } catch (err) {
        console.warn("[ModelDetail] refresh:", err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [model, modelId]);

  const handlePull = useCallback(async () => {
    if (!model) return;
    setIsPulling(true);
    try {
      await triggerPull({
        model_name: model.model_name,
        display_name: model.display_name || model.model_name,
        parameter_size: model.size || undefined,
        disk_size: model.disk_size || undefined,
        context_window: model.context_window || undefined,
      });
      const refreshed = await api.get<CatalogModel>(`/models/catalog/${modelId}`);
      setModel(refreshed);
    } catch (err) {
      console.error("[ModelDetail] pull:", err);
      setIsPulling(false);
    }
  }, [model, modelId, triggerPull]);

  const handleRemove = useCallback(async () => {
    if (!model) return;
    if (
      !confirm(
        `Remove "${model.display_name || model.model_name}" from the catalog?`,
      )
    )
      return;
    try {
      await removeFromCatalog(model.id);
      navigate("/models");
    } catch (err) {
      console.error("[ModelDetail] remove:", err);
    }
  }, [model, removeFromCatalog, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="space-y-4 p-6">
        <nav>
          <Link
            to="/models"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Box className="h-4 w-4" />
            Models
          </Link>
        </nav>
        <div className="rounded-lg border bg-card p-12 text-center">
          <Box className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Model not found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || "This model does not exist or has been removed."}
          </p>
        </div>
      </div>
    );
  }

  const providerInfo =
    PROVIDER_INFO[model.provider] ?? { name: model.provider, color: "bg-muted-foreground" };
  const configured = isProviderConfigured(model.provider);

  // Determine accessibility
  const isOllama = model.provider === "ollama";
  const isReady = model.pull_status === "ready";
  const isDownloading = model.pull_status === "downloading";
  const isCloudAccessible = !isOllama && configured;
  const isAccessible = isReady || isCloudAccessible;

  const maxOutputTokens = model.max_output_tokens || 128000;
  const tokenStep =
    maxOutputTokens <= 8192 ? 100 : maxOutputTokens <= 32768 ? 256 : 512;

  const pullProgress = model.pull_progress ?? 0;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Full-width header */}
      <DetailHeader
        backHref="/models"
        backLabel="Models"
        renderLink={({ href, className, children }) => <Link to={href} className={className}>{children}</Link>}
        title={model.display_name || model.model_name}
        badges={
          <>
            <div className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", providerInfo.color)} />
              <span className="text-xs text-muted-foreground">
                {providerInfo.name}
              </span>
            </div>
            <ModelStatusBadge
              model={{
                pull_status: model.pull_status,
                pull_progress: model.pull_progress,
                pull_error: model.pull_error,
                provider: model.provider,
              }}
              configured={configured}
            />
          </>
        }
        actions={
          <>
            {isOllama && !isReady && !isDownloading && (
              <Button
                size="sm"
                onClick={handlePull}
                disabled={isPulling}
                className="gap-1.5"
              >
                {isPulling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {isPulling ? "Pulling..." : "Pull Model"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive gap-1.5"
              onClick={handleRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          </>
        }
      />

      {/* Content: Left properties + Right playground */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Left Panel */}
        <div className="w-full lg:w-[380px] overflow-y-auto lg:border-r border-border p-5 space-y-5">
          {/* Technical model name */}
          <p className="text-xs text-muted-foreground font-mono">
            {model.model_name}
          </p>

          {/* Pull progress */}
          {isDownloading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-info flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Downloading...
                </span>
                <span className="font-medium">{pullProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-info rounded-full transition-all duration-500"
                  style={{ width: `${pullProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Pull error */}
          {model.pull_status === "error" && model.pull_error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {model.pull_error}
            </div>
          )}

          <Separator />

          {/* Model Specs */}
          <Section icon={Cpu} title="Specifications">
            <div className="space-y-1">
              <PropRow label="Type">
                <div className="flex items-center gap-1.5 text-sm">
                  {model.model_type === "local" ? (
                    <>
                      <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                      Local
                    </>
                  ) : (
                    <>
                      <Cloud className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                      Cloud
                    </>
                  )}
                </div>
              </PropRow>

              {model.size && (
                <PropRow label="Parameters">
                  <span className="text-sm font-medium">{model.size}</span>
                </PropRow>
              )}

              {model.disk_size && (
                <PropRow label="Disk size">
                  <span className="text-sm font-medium">{model.disk_size}</span>
                </PropRow>
              )}

              {model.context_window && (
                <PropRow label="Context">
                  <span className="text-sm font-medium">
                    {(model.context_window / 1024).toFixed(0)}K tokens
                  </span>
                </PropRow>
              )}

              {model.max_output_tokens && (
                <PropRow label="Max output">
                  <span className="text-sm font-medium">
                    {(model.max_output_tokens / 1024).toFixed(0)}K tokens
                  </span>
                </PropRow>
              )}

              {model.family && (
                <PropRow label="Family">
                  <span className="text-sm font-medium">{model.family}</span>
                </PropRow>
              )}

              {model.quantization && (
                <PropRow label="Quantization">
                  <Badge variant="outline" className="text-xs font-mono">
                    {model.quantization}
                  </Badge>
                </PropRow>
              )}
            </div>
          </Section>

          {/* Capabilities */}
          {Object.keys(model.capabilities).length > 0 && (
            <>
              <Separator />
              <Section icon={Sparkles} title="Capabilities">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(model.capabilities)
                    .filter(([, v]) => v)
                    .map(([key]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}
                      </Badge>
                    ))}
                </div>
              </Section>
            </>
          )}

          {/* Playground Parameters — only when accessible */}
          {isAccessible && (
            <>
              <Separator />

              <Section icon={SlidersHorizontal} title="Playground Parameters">
                <div className="space-y-4">
                  {/* Temperature */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-sm text-muted-foreground">
                        Temperature
                      </span>
                      <span className="text-sm font-mono">
                        {temperature.toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      value={[temperature]}
                      onValueChange={([v]) => setTemperature(v)}
                      min={0}
                      max={2}
                      step={0.1}
                    />
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-sm text-muted-foreground">
                        Max tokens
                      </span>
                      <span className="text-sm font-mono">
                        {maxTokens.toLocaleString()}
                      </span>
                    </div>
                    <Slider
                      value={[maxTokens]}
                      onValueChange={([v]) => setMaxTokensOverride(v)}
                      min={1}
                      max={maxOutputTokens}
                      step={tokenStep}
                    />
                  </div>

                  {/* System Prompt */}
                  <div>
                    <span className="text-sm text-muted-foreground">
                      System prompt
                    </span>
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Optional system instructions..."
                      className="mt-1.5 w-full min-h-[80px] resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Right Panel — Playground or CTA */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          {isAccessible ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 bg-muted/20">
              <Box className="h-12 w-12 text-muted-foreground mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">
                Playground coming soon
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Test this model with real-time conversations
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              {isDownloading ? (
                <>
                  <Loader2 className="h-16 w-16 text-info animate-spin mb-6" />
                  <h3 className="text-lg font-medium mb-2">Pulling model...</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {model.display_name || model.model_name} is downloading (
                    {pullProgress}%)
                  </p>
                  <div className="w-64 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-info rounded-full transition-all duration-500"
                      style={{ width: `${pullProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    The playground will be available once the download completes.
                  </p>
                </>
              ) : isOllama ? (
                <>
                  <Download className="h-16 w-16 text-muted-foreground mb-6" />
                  <h3 className="text-lg font-medium mb-2">Model not pulled</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Pull this model to use the playground.
                  </p>
                  <Button
                    onClick={handlePull}
                    disabled={isPulling}
                    className="gap-2"
                  >
                    {isPulling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {isPulling ? "Pulling..." : "Pull Model"}
                  </Button>
                </>
              ) : (
                <>
                  <KeyRound className="h-16 w-16 text-muted-foreground mb-6" />
                  <h3 className="text-lg font-medium mb-2">No API credentials</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Configure your {providerInfo.name} API key in Settings to
                    use this model.
                  </p>
                  <Button variant="outline" onClick={() => navigate("/configuration?tab=providers")}>
                    <KeyRound className="h-4 w-4 mr-2" />
                    Go to Settings
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
