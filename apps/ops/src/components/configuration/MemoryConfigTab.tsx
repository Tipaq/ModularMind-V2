import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Brain,
  Save,
  RotateCcw,
  Loader2,
  Check,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Badge,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@modularmind/ui";
import type { LocalSettings } from "@modularmind/api-client";
import { api } from "../../lib/api";
import type { MemoryConfig, CatalogModel } from "./memory-config/types";
import { SectionHeader } from "./memory-config/shared";
import { ExtractionConfig } from "./memory-config/ExtractionConfig";
import { ScoringConfig } from "./memory-config/ScoringConfig";
import { DecayConfig } from "./memory-config/DecayConfig";
import { ConsolidationConfig } from "./memory-config/ConsolidationConfig";

// ── Types ────────────────────────────────────────────────────────

interface ProviderConfig {
  provider: string;
  name: string;
  is_configured: boolean;
}

// Dimension maps per provider
const OLLAMA_DIMENSIONS: Record<string, number> = {
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
  "snowflake-arctic-embed": 1024,
};

const OPENAI_MODELS = [
  { id: "text-embedding-3-small", label: "text-embedding-3-small", dim: 1536 },
  { id: "text-embedding-3-large", label: "text-embedding-3-large", dim: 3072 },
  { id: "text-embedding-ada-002", label: "text-embedding-ada-002", dim: 1536 },
];

const ALL_DIMENSIONS: Record<string, number> = {
  ...OLLAMA_DIMENSIONS,
  ...Object.fromEntries(OPENAI_MODELS.map((m) => [m.id, m.dim])),
};

const PROVIDERS = [
  { id: "ollama", label: "Ollama (local)" },
  { id: "openai", label: "OpenAI" },
];

// ── Main Component ───────────────────────────────────────────────

export default function MemoryConfigTab() {
  const [config, setConfig] = useState<MemoryConfig | null>(null);
  const [draft, setDraft] = useState<Partial<MemoryConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Embedding state (separate API: /internal/settings)
  const [embeddingSettings, setEmbeddingSettings] = useState<LocalSettings | null>(null);
  const [embeddingModels, setEmbeddingModels] = useState<CatalogModel[]>([]);
  const [llmModels, setLlmModels] = useState<CatalogModel[]>([]);
  const [embeddingSaving, setEmbeddingSaving] = useState(false);
  const [embeddingSuccess, setEmbeddingSuccess] = useState(false);
  const [pendingEmbedding, setPendingEmbedding] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [memConfig, settingsData, catalogData, providersData] = await Promise.all([
          api.get<MemoryConfig>("/memory/admin/config"),
          api.get<LocalSettings>("/internal/settings"),
          api.get<{ models: CatalogModel[] }>("/models/catalog?page_size=500"),
          api.get<ProviderConfig[]>("/models/providers"),
        ]);
        setConfig(memConfig);
        setEmbeddingSettings(settingsData);
        setEmbeddingModels(
          catalogData.models.filter((m) => m.is_embedding || m.capabilities?.embedding),
        );

        // Only show models that are actually available for chat:
        // - Must have chat capability
        // - Ollama (local): must be pulled (pull_status === "ready")
        // - Cloud providers: must have API key configured
        const configuredProviders = new Set(
          providersData.filter((p) => p.is_configured).map((p) => p.provider),
        );
        setLlmModels(
          catalogData.models.filter((m) => {
            if (m.is_embedding) return false;
            if (!m.context_window) return false;
            if (!m.capabilities?.chat) return false;
            // Local models: must be pulled
            if (m.model_type === "local" || m.provider === "ollama") {
              return m.pull_status === "ready";
            }
            // Cloud models: provider must have credentials
            return configuredProviders.has(m.provider);
          }),
        );
      } catch {
        setError("Failed to load memory configuration");
      }
      setLoading(false);
    })();
  }, []);

  const val = useCallback(
    <K extends keyof MemoryConfig>(key: K): MemoryConfig[K] => {
      if (key in draft) return draft[key] as MemoryConfig[K];
      return config![key];
    },
    [config, draft],
  );

  const set = useCallback(
    <K extends keyof MemoryConfig>(key: K, value: MemoryConfig[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const hasChanges = Object.keys(draft).length > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<MemoryConfig>("/memory/admin/config", draft);
      setConfig(updated);
      setDraft({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setError("Failed to save configuration");
    }
    setSaving(false);
  };

  const handleReset = () => setDraft({});

  const handleProviderChange = async (provider: string) => {
    if (!embeddingSettings) return;
    const currentProvider = embeddingSettings.memory_embedding_provider || "ollama";
    if (provider === currentProvider) return;

    // Pick a sensible default model for the new provider
    const defaultModel =
      provider === "openai" ? "text-embedding-3-small" : "nomic-embed-text";

    // Check dimension mismatch
    const currentModel = embeddingSettings.memory_embedding_model || "nomic-embed-text";
    const currentDim = ALL_DIMENSIONS[currentModel];
    const newDim = ALL_DIMENSIONS[defaultModel];
    if (currentDim && newDim && currentDim !== newDim) {
      setPendingEmbedding(`${provider}:${defaultModel}`);
    } else {
      await saveEmbedding(provider, defaultModel);
    }
  };

  const handleModelChange = (model: string) => {
    if (!embeddingSettings) return;
    const currentModel = embeddingSettings.memory_embedding_model || "nomic-embed-text";
    if (model === currentModel) {
      setPendingEmbedding(null);
      return;
    }
    const currentDim = ALL_DIMENSIONS[currentModel];
    const newDim = ALL_DIMENSIONS[model];
    if (currentDim && newDim && currentDim !== newDim) {
      const provider = embeddingSettings.memory_embedding_provider || "ollama";
      setPendingEmbedding(`${provider}:${model}`);
    } else {
      saveEmbedding(undefined, model);
    }
  };

  const saveEmbedding = async (provider?: string, model?: string) => {
    setPendingEmbedding(null);
    setEmbeddingSaving(true);
    try {
      const patch: Record<string, string> = {};
      if (provider !== undefined) patch.memory_embedding_provider = provider;
      if (model !== undefined) patch.memory_embedding_model = model;
      const data = await api.patch<LocalSettings>("/internal/settings", patch);
      setEmbeddingSettings(data);
      setEmbeddingSuccess(true);
      setTimeout(() => setEmbeddingSuccess(false), 2000);
    } catch {
      setError("Failed to update embedding settings");
    }
    setEmbeddingSaving(false);
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentProvider = embeddingSettings?.memory_embedding_provider || "ollama";
  const currentEmbModel = embeddingSettings?.memory_embedding_model || "nomic-embed-text";
  const currentDim = ALL_DIMENSIONS[currentEmbModel];

  // pendingEmbedding is "provider:model" or null
  const pendingModel = pendingEmbedding?.split(":")[1];
  const pendingDim = pendingModel ? ALL_DIMENSIONS[pendingModel] : null;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure memory pipeline: embedding, decay, scoring, extraction, and retrieval.
        </p>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <Badge variant="success" className="gap-1">
              <Check className="h-3 w-3" /> Saved
            </Badge>
          )}
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...</>
            ) : (
              <><Save className="h-3.5 w-3.5 mr-1.5" /> Save Changes</>
            )}
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Changes apply immediately for API operations (retrieval, scoring).
          Worker tasks (extraction, decay) pick up new values on their next scheduled cycle.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Embedding Model + Context Budget (2-column) ─────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeader
            icon={Brain}
            title="Embedding Model"
            description="Model used for memory vector embeddings, fact search, and cross-conversation retrieval."
            right={
              <>
                {embeddingSaving && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
                {embeddingSuccess && <Badge variant="success" className="gap-1"><Check className="h-3 w-3" /> Saved</Badge>}
              </>
            }
          />
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Provider</Label>
                <Select value={currentProvider} onValueChange={handleProviderChange}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Model</Label>
                {currentProvider === "ollama" ? (
                  <Select value={currentEmbModel} onValueChange={handleModelChange}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {embeddingModels.map((m) => (
                        <SelectItem key={m.model_name} value={m.model_name}>
                          {m.display_name}
                          {OLLAMA_DIMENSIONS[m.model_name] ? ` (${OLLAMA_DIMENSIONS[m.model_name]}d)` : ""}
                          {m.pull_status === "ready" ? " — Pulled" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={currentEmbModel} onValueChange={handleModelChange}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPENAI_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label} ({m.dim}d)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {currentDim && (
                  <p className="text-[11px] text-muted-foreground">Vector dimension: {currentDim}</p>
                )}
              </div>
            </div>
            {pendingEmbedding && pendingDim && currentDim && pendingDim !== currentDim && (
              <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-sm text-destructive">
                    <p className="font-medium">Dimension mismatch</p>
                    <p>
                      Changing from <strong>{currentEmbModel}</strong> ({currentDim}d) to{" "}
                      <strong>{pendingModel}</strong> ({pendingDim}d) will invalidate
                      all existing memory vectors.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setPendingEmbedding(null)}>Cancel</Button>
                  <Button variant="destructive" size="sm" onClick={() => {
                    const [prov, mod] = pendingEmbedding.split(":");
                    saveEmbedding(prov, mod);
                  }}>
                    Change anyway
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <ConsolidationConfig
          val={val}
          set={set}
          llmModels={llmModels}
        />
      </div>

      {/* ── Decay & Extraction (2-column grid) ───────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DecayConfig val={val} set={set} />
        <ExtractionConfig val={val} set={set} />
      </div>

      {/* ── Scoring & Retrieval + General (full width) ─────────────── */}
      <ScoringConfig val={val} set={set} />
    </div>
  );
}
