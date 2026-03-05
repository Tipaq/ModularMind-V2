import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Timer,
  Target,
  Settings2,
  Brain,
  Save,
  RotateCcw,
  Loader2,
  Check,
  AlertTriangle,
  Info,
  Layers,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Slider,
  Switch,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  cn,
} from "@modularmind/ui";
import type { LocalSettings } from "@modularmind/api-client";
import { api } from "../../lib/api";

// ── Types ────────────────────────────────────────────────────────

interface MemoryConfig {
  decay_episodic_half_life: number;
  decay_semantic_half_life: number;
  decay_procedural_half_life: number;
  decay_prune_threshold: number;
  score_weight_recency: number;
  score_weight_importance: number;
  score_weight_relevance: number;
  score_weight_frequency: number;
  min_relevance_gate: number;
  extraction_batch_size: number;
  extraction_idle_seconds: number;
  extraction_scan_interval: number;
  buffer_token_threshold: number;
  max_entries: number;
  fact_extraction_enabled: boolean;
  fact_extraction_min_messages: number;
  scorer_enabled: boolean;
  scorer_min_importance: number;
  context_budget_history_pct: number;
  context_budget_memory_pct: number;
  context_budget_rag_pct: number;
  context_budget_default_context_window: number;
  context_budget_max_pct: number;
}

interface CatalogModel {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
  model_type?: string;
  is_embedding?: boolean;
  capabilities?: Record<string, boolean>;
  pull_status?: string | null;
  context_window?: number | null;
}

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

// ── Field Components ─────────────────────────────────────────────

function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          className="w-24 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || min || 0)}
        />
        {unit && (
          <span className="text-xs text-muted-foreground w-8">{unit}</span>
        )}
      </div>
    </div>
  );
}

function SliderField({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">{label}</Label>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <span className="text-sm font-mono tabular-nums w-12 text-right">
          {value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
    </div>
  );
}

function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ── Context Budget Card ──────────────────────────────────────────

const BUDGET_LAYERS = [
  { key: "history" as const, label: "History", pctKey: "context_budget_history_pct" as const, color: "bg-info" },
  { key: "memory" as const, label: "Memory", pctKey: "context_budget_memory_pct" as const, color: "bg-warning" },
  { key: "rag" as const, label: "RAG", pctKey: "context_budget_rag_pct" as const, color: "bg-success" },
];

function ContextBudgetCard({
  val,
  set,
  llmModels,
}: {
  val: <K extends keyof MemoryConfig>(key: K) => MemoryConfig[K];
  set: <K extends keyof MemoryConfig>(key: K, value: MemoryConfig[K]) => void;
  llmModels: CatalogModel[];
}) {
  const [previewModelId, setPreviewModelId] = useState<string | null>(null);

  const fullCW = previewModelId
    ? llmModels.find((m) => m.id === previewModelId)?.context_window ?? val("context_budget_default_context_window")
    : val("context_budget_default_context_window");

  const maxPct = val("context_budget_max_pct");
  const effectiveCW = Math.round(fullCW * maxPct / 100);

  const historyPct = val("context_budget_history_pct");
  const memoryPct = val("context_budget_memory_pct");
  const ragPct = val("context_budget_rag_pct");
  const totalLayerPct = historyPct + memoryPct + ragPct;
  const reservedPct = Math.max(0, 100 - totalLayerPct);
  const isValid = totalLayerPct <= 85;

  const formatK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);

  const handleLayerTokenChange = (pctKey: typeof BUDGET_LAYERS[number]["pctKey"], tokens: number) => {
    if (effectiveCW <= 0) return;
    const pct = Math.round((tokens / effectiveCW) * 1000) / 10;
    set(pctKey, Math.max(0, Math.min(pct, 100)));
  };

  const handleMaxPctTokenChange = (tokens: number) => {
    if (fullCW <= 0) return;
    const pct = Math.round((tokens / fullCW) * 1000) / 10;
    set("context_budget_max_pct", Math.max(10, Math.min(pct, 100)));
  };

  return (
    <Card>
      <SectionHeader
        icon={Layers}
        title="Context Budget"
        description="How context window is distributed across layers. Percentages auto-scale to each model's context size."
      />
      <CardContent className="space-y-5">
        {/* Model preview selector */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Preview model (for token calculations)</Label>
          <Select
            value={previewModelId ?? "__default__"}
            onValueChange={(v) => setPreviewModelId(v === "__default__" ? null : v)}
          >
            <SelectTrigger className="w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                Default ({formatK(val("context_budget_default_context_window"))} context)
              </SelectItem>
              {llmModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name} ({formatK(m.context_window ?? 0)} context)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Soft limit row */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-20 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary" />
              <Label className="text-sm">Soft limit</Label>
            </div>
            <div className="flex items-center gap-1.5 flex-1">
              <Input
                type="number"
                min={10}
                max={100}
                step={5}
                className="w-20 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={maxPct}
                onChange={(e) => set("context_budget_max_pct", Math.max(10, Math.min(Number(e.target.value) || 10, 100)))}
              />
              <span className="text-xs text-muted-foreground w-4">%</span>
            </div>
            <div className="flex items-center gap-1.5 flex-1">
              <Input
                type="number"
                min={0}
                step={1024}
                className="w-24 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={Math.round(fullCW * maxPct / 100)}
                onChange={(e) => handleMaxPctTokenChange(Number(e.target.value) || 0)}
              />
              <span className="text-xs text-muted-foreground w-6">tok</span>
            </div>
          </div>
          {maxPct < 100 && (
            <p className="text-[11px] text-muted-foreground ml-[86px]">
              Effective context: {formatK(effectiveCW)} of {formatK(fullCW)} — layers allocate within this cap
            </p>
          )}
        </div>

        {/* Budget allocation bar */}
        <div className="space-y-2">
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {BUDGET_LAYERS.map((layer) => {
              const pct = val(layer.pctKey) as number;
              return (
                <div
                  key={layer.key}
                  className={cn("h-full transition-all", layer.color)}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
            <div
              className="h-full bg-muted-foreground/20 transition-all"
              style={{ width: `${reservedPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex gap-3">
              {BUDGET_LAYERS.map((layer) => (
                <span key={layer.key} className="flex items-center gap-1">
                  <span className={cn("h-2 w-2 rounded-full", layer.color)} />
                  {layer.label} {(val(layer.pctKey) as number).toFixed(0)}%
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                Reserved {reservedPct.toFixed(0)}%
              </span>
            </div>
            <span className={cn("font-medium tabular-nums", isValid ? "text-success" : "text-destructive")}>
              {totalLayerPct.toFixed(0)}%
            </span>
          </div>
          {!isValid && (
            <div className="flex items-center gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Total exceeds 85% — leave room for system prompt + response
            </div>
          )}
        </div>

        {/* Per-layer dual inputs */}
        {BUDGET_LAYERS.map((layer) => {
          const pct = val(layer.pctKey) as number;
          const tokens = Math.round(effectiveCW * pct / 100);
          return (
            <div key={layer.key} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-20 shrink-0">
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", layer.color)} />
                <Label className="text-sm">{layer.label}</Label>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  type="number"
                  min={0}
                  max={60}
                  step={1}
                  className="w-20 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={pct}
                  onChange={(e) => set(layer.pctKey, Math.max(0, Math.min(Number(e.target.value) || 0, 60)))}
                />
                <span className="text-xs text-muted-foreground w-4">%</span>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  type="number"
                  min={0}
                  step={100}
                  className="w-24 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={tokens}
                  onChange={(e) => handleLayerTokenChange(layer.pctKey, Number(e.target.value) || 0)}
                />
                <span className="text-xs text-muted-foreground w-6">tok</span>
              </div>
            </div>
          );
        })}

        {/* Separator + absolute fields */}
        <div className="border-t border-border pt-4 space-y-4">
          <NumberField
            label="Default context window"
            description="Fallback when model metadata is unavailable"
            value={val("context_budget_default_context_window")}
            onChange={(v) => set("context_budget_default_context_window", v)}
            min={2048}
            max={200000}
            step={1024}
            unit="tok"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Weights Bar ──────────────────────────────────────────────────

const WEIGHT_SEGMENTS = [
  { key: "recency" as const, label: "Recency", short: "Rec", color: "bg-info" },
  { key: "importance" as const, label: "Importance", short: "Imp", color: "bg-warning" },
  { key: "relevance" as const, label: "Relevance", short: "Rel", color: "bg-success" },
  { key: "frequency" as const, label: "Frequency", short: "Freq", color: "bg-primary" },
];

function WeightsBar({
  weights,
}: {
  weights: { recency: number; importance: number; relevance: number; frequency: number };
}) {
  const total = weights.recency + weights.importance + weights.relevance + weights.frequency;
  const isValid = Math.abs(total - 1.0) < 0.05;

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {WEIGHT_SEGMENTS.map((seg) => (
          <div
            key={seg.key}
            className={cn("h-full transition-all", seg.color)}
            style={{ width: `${(weights[seg.key] / (total || 1)) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex gap-3">
          {WEIGHT_SEGMENTS.map((seg) => (
            <span key={seg.key} className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", seg.color)} />
              {seg.short} {(weights[seg.key] * 100).toFixed(0)}%
            </span>
          ))}
        </div>
        <span className={cn("font-medium tabular-nums", isValid ? "text-success" : "text-destructive")}>
          {(total * 100).toFixed(0)}%
        </span>
      </div>
      {!isValid && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Weights should sum to 100%
        </div>
      )}
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
  right,
}: {
  icon: typeof Brain;
  title: string;
  description: string;
  right?: React.ReactNode;
}) {
  return (
    <CardHeader className="pb-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardTitle className="text-sm">{title}</CardTitle>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <CardDescription className="text-xs">{description}</CardDescription>
    </CardHeader>
  );
}

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

      {/* ── Embedding Model + Context Window (2-column) ─────────── */}
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

        <ContextBudgetCard
          val={val}
          set={set}
          llmModels={llmModels}
        />
      </div>

      {/* ── Decay & Extraction (2-column grid) ───────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Decay & Pruning */}
        <Card>
          <SectionHeader
            icon={Timer}
            title="Decay & Pruning"
            description="How memories fade over time. Half-life = days until importance drops 50% without access."
          />
          <CardContent className="space-y-4">
            <NumberField
              label="Episodic half-life"
              description="Events and experiences"
              value={val("decay_episodic_half_life")}
              onChange={(v) => set("decay_episodic_half_life", v)}
              min={1}
              unit="days"
            />
            <NumberField
              label="Semantic half-life"
              description="Facts and knowledge"
              value={val("decay_semantic_half_life")}
              onChange={(v) => set("decay_semantic_half_life", v)}
              min={1}
              unit="days"
            />
            <NumberField
              label="Procedural half-life"
              description="Skills and processes"
              value={val("decay_procedural_half_life")}
              onChange={(v) => set("decay_procedural_half_life", v)}
              min={1}
              unit="days"
            />
            <div className="pt-1">
              <SliderField
                label="Prune threshold"
                description="Delete entries below this importance during consolidation"
                value={val("decay_prune_threshold")}
                onChange={(v) => set("decay_prune_threshold", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Extraction */}
        <Card>
          <SectionHeader
            icon={Settings2}
            title="Extraction"
            description="When the system extracts facts from conversations into memory entries."
          />
          <CardContent className="space-y-4">
            <NumberField
              label="Batch size"
              description="Extract after this many new messages"
              value={val("extraction_batch_size")}
              onChange={(v) => set("extraction_batch_size", v)}
              min={5}
              max={100}
              unit="msgs"
            />
            <NumberField
              label="Idle timeout"
              description="Extract when conversation is idle"
              value={val("extraction_idle_seconds")}
              onChange={(v) => set("extraction_idle_seconds", v)}
              min={60}
              max={3600}
              unit="sec"
            />
            <NumberField
              label="Scan interval"
              description="How often the scheduler checks for extractions"
              value={val("extraction_scan_interval")}
              onChange={(v) => set("extraction_scan_interval", v)}
              min={30}
              max={600}
              unit="sec"
            />
            <NumberField
              label="Buffer threshold"
              description="Trigger when unextracted tokens exceed this"
              value={val("buffer_token_threshold")}
              onChange={(v) => set("buffer_token_threshold", v)}
              min={500}
              max={20000}
              step={500}
              unit="tok"
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Scoring & Retrieval (full width) ─────────────────────── */}
      <Card>
        <SectionHeader
          icon={Target}
          title="Scoring & Retrieval"
          description="How each factor contributes to a memory's retrieval score. Weights should sum to 100%."
        />
        <CardContent className="space-y-5">
          <WeightsBar
            weights={{
              recency: val("score_weight_recency"),
              importance: val("score_weight_importance"),
              relevance: val("score_weight_relevance"),
              frequency: val("score_weight_frequency"),
            }}
          />

          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <SliderField
              label="Recency"
              description="How recently the memory was accessed"
              value={val("score_weight_recency")}
              onChange={(v) => set("score_weight_recency", v)}
            />
            <SliderField
              label="Importance"
              description="LLM-scored importance of the memory"
              value={val("score_weight_importance")}
              onChange={(v) => set("score_weight_importance", v)}
            />
            <SliderField
              label="Relevance"
              description="Semantic similarity to the current query"
              value={val("score_weight_relevance")}
              onChange={(v) => set("score_weight_relevance", v)}
            />
            <SliderField
              label="Frequency"
              description="How often the memory has been accessed"
              value={val("score_weight_frequency")}
              onChange={(v) => set("score_weight_frequency", v)}
            />
          </div>

          <div className="border-t border-border pt-4">
            <SliderField
              label="Min relevance gate"
              description="Entries below this vector similarity score are dropped regardless of other factors"
              value={val("min_relevance_gate")}
              onChange={(v) => set("min_relevance_gate", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── General (full width) ─────────────────────────────────── */}
      <Card>
        <SectionHeader
          icon={Brain}
          title="General"
          description="Global memory system toggles and limits."
        />
        <CardContent>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <SwitchField
              label="Fact extraction"
              description="Automatically extract facts from conversations"
              checked={val("fact_extraction_enabled")}
              onChange={(v) => set("fact_extraction_enabled", v)}
            />
            <SwitchField
              label="Memory scorer"
              description="LLM-based importance scoring for extracted facts"
              checked={val("scorer_enabled")}
              onChange={(v) => set("scorer_enabled", v)}
            />
            <NumberField
              label="Max entries"
              description="Maximum memory entries per scope"
              value={val("max_entries")}
              onChange={(v) => set("max_entries", v)}
              min={100}
              max={10000}
            />
            <NumberField
              label="Min messages"
              description="Require before first extraction"
              value={val("fact_extraction_min_messages")}
              onChange={(v) => set("fact_extraction_min_messages", v)}
              min={1}
              max={100}
              unit="msgs"
            />
            <SliderField
              label="Scorer min importance"
              description="Discard facts below this importance score"
              value={val("scorer_min_importance")}
              onChange={(v) => set("scorer_min_importance", v)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
