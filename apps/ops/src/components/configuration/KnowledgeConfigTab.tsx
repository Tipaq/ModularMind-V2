import { useEffect, useState } from "react";
import {
  RefreshCw,
  BookOpen,
  AlertTriangle,
  Check,
  Search,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from "@modularmind/ui";
import type { LocalSettings, CatalogModel } from "@modularmind/api-client";
import { api } from "../../lib/api";

interface RerankConfig {
  rerank_provider: string;
  rerank_model: string;
}

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

export function KnowledgeConfigTab() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [embeddingModels, setEmbeddingModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Embedding state
  const [embeddingSaving, setEmbeddingSaving] = useState(false);
  const [embeddingSuccess, setEmbeddingSuccess] = useState(false);
  const [pendingEmbedding, setPendingEmbedding] = useState<string | null>(null);

  // Reranking state
  const [rerankProvider, setRerankProvider] = useState("none");
  const [rerankModel, setRerankModel] = useState("");
  const [rerankSaving, setRerankSaving] = useState(false);
  const [rerankSuccess, setRerankSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [settingsData, catalogData] = await Promise.all([
          api.get<LocalSettings>("/internal/settings"),
          api.get<{ models: CatalogModel[] }>("/models/catalog?page_size=500"),
        ]);
        setSettings(settingsData);
        setEmbeddingModels(
          catalogData.models.filter((m) => m.capabilities?.embedding),
        );

        try {
          const rerank = await api.get<RerankConfig>("/internal/rerank-config");
          setRerankProvider(rerank.rerank_provider || "none");
          setRerankModel(rerank.rerank_model || "");
        } catch {
          // Endpoint may not exist yet
        }
      } catch {
        setError("Failed to load knowledge configuration");
      }
      setLoading(false);
    })();
  }, []);

  const handleProviderChange = async (provider: string) => {
    if (!settings) return;
    const currentProvider = settings.knowledge_embedding_provider || "ollama";
    if (provider === currentProvider) return;

    const defaultModel =
      provider === "openai" ? "text-embedding-3-small" : "nomic-embed-text";

    const currentModel = settings.knowledge_embedding_model || "nomic-embed-text";
    const currentDim = ALL_DIMENSIONS[currentModel];
    const newDim = ALL_DIMENSIONS[defaultModel];
    if (currentDim && newDim && currentDim !== newDim) {
      setPendingEmbedding(`${provider}:${defaultModel}`);
    } else {
      await saveEmbedding(provider, defaultModel);
    }
  };

  const handleModelChange = (model: string) => {
    if (!settings) return;
    const currentModel = settings.knowledge_embedding_model || "nomic-embed-text";
    if (model === currentModel) {
      setPendingEmbedding(null);
      return;
    }
    const currentDim = ALL_DIMENSIONS[currentModel];
    const newDim = ALL_DIMENSIONS[model];
    if (currentDim && newDim && currentDim !== newDim) {
      const provider = settings.knowledge_embedding_provider || "ollama";
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
      if (provider !== undefined) patch.knowledge_embedding_provider = provider;
      if (model !== undefined) patch.knowledge_embedding_model = model;
      const data = await api.patch<LocalSettings>("/internal/settings", patch);
      setSettings(data);
      setEmbeddingSuccess(true);
      setTimeout(() => setEmbeddingSuccess(false), 2000);
    } catch {
      setError("Failed to update embedding settings");
    }
    setEmbeddingSaving(false);
  };

  const saveRerank = async (provider: string, model: string) => {
    setRerankSaving(true);
    try {
      await api.patch("/internal/rerank-config", {
        rerank_provider: provider,
        rerank_model: model,
      });
      setRerankProvider(provider);
      setRerankModel(model);
      setRerankSuccess(true);
      setTimeout(() => setRerankSuccess(false), 2000);
    } catch {
      setRerankProvider(provider);
      setRerankModel(model);
    }
    setRerankSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentProvider = settings?.knowledge_embedding_provider || "ollama";
  const currentEmbModel = settings?.knowledge_embedding_model || "nomic-embed-text";
  const currentDim = ALL_DIMENSIONS[currentEmbModel];

  const pendingModel = pendingEmbedding?.split(":")[1];
  const pendingDim = pendingModel ? ALL_DIMENSIONS[pendingModel] : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configure the knowledge pipeline: embedding model for RAG document chunks and reranking for search results.
      </p>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Embedding Model */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-sm">Embedding Model</CardTitle>
            {embeddingSaving && <RefreshCw className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
            {embeddingSuccess && <Badge variant="success" className="ml-auto gap-1"><Check className="h-3 w-3" /> Saved</Badge>}
          </div>
          <CardDescription className="text-xs">
            Model used for RAG document chunks and knowledge search queries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <select
                value={currentProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              {currentProvider === "ollama" ? (
                <select
                  value={currentEmbModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {embeddingModels.map((m) => (
                    <option key={m.model_name} value={m.model_name}>
                      {m.display_name}
                      {OLLAMA_DIMENSIONS[m.model_name] ? ` (${OLLAMA_DIMENSIONS[m.model_name]}d)` : ""}
                      {m.pull_status === "ready" ? " — Pulled" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={currentEmbModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.dim}d)
                    </option>
                  ))}
                </select>
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
                    all existing knowledge vectors.
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

      {/* Reranking */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-sm">Reranking</CardTitle>
            {rerankSaving && <RefreshCw className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
            {rerankSuccess && <Badge variant="success" className="ml-auto gap-1"><Check className="h-3 w-3" /> Saved</Badge>}
          </div>
          <CardDescription className="text-xs">
            Optional reranking step applied after initial vector search to improve result quality.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <Select
                value={rerankProvider}
                onValueChange={(v) => saveRerank(v, v === "none" ? "" : rerankModel)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (disabled)</SelectItem>
                  <SelectItem value="cohere">Cohere</SelectItem>
                  <SelectItem value="cross-encoder">Cross-Encoder (local)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rerankProvider !== "none" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Input
                  value={rerankModel}
                  onChange={(e) => setRerankModel(e.target.value)}
                  onBlur={() => saveRerank(rerankProvider, rerankModel)}
                  placeholder={
                    rerankProvider === "cohere"
                      ? "rerank-english-v3.0"
                      : "cross-encoder/ms-marco-MiniLM-L-6-v2"
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  {rerankProvider === "cohere"
                    ? "Requires a Cohere API key in the Providers tab."
                    : "Uses a local cross-encoder model for reranking."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
