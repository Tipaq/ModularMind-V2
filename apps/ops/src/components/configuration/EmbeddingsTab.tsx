import { useEffect, useState } from "react";
import { RefreshCw, BookOpen, AlertTriangle, Check, Brain } from "lucide-react";
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
  Badge,
} from "@modularmind/ui";
import type { LocalSettings, CatalogModel } from "@modularmind/api-client";
import { api } from "../../lib/api";

// Known embedding dimensions per model (matches ENGINE MODEL_DIMENSIONS)
const MODEL_DIMENSIONS: Record<string, number> = {
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
  "snowflake-arctic-embed": 1024,
};

interface PipelineCardProps {
  title: string;
  description: string;
  icon: typeof Brain;
  providerValue: string;
  modelValue: string;
  embeddingModels: CatalogModel[];
  onModelChange: (model: string) => void;
  saving: boolean;
  saveSuccess: boolean;
}

function PipelineCard({
  title,
  description,
  icon: Icon,
  providerValue,
  modelValue,
  embeddingModels,
  onModelChange,
  saving,
  saveSuccess,
}: PipelineCardProps) {
  const currentDim = MODEL_DIMENSIONS[modelValue];
  const [pendingModel, setPendingModel] = useState<string | null>(null);

  const pendingDim = pendingModel ? MODEL_DIMENSIONS[pendingModel] : null;
  const dimensionMismatch =
    pendingModel && currentDim && pendingDim && currentDim !== pendingDim;

  const handleSelect = (value: string) => {
    if (value === modelValue) {
      setPendingModel(null);
      return;
    }

    const newDim = MODEL_DIMENSIONS[value];
    if (currentDim && newDim && currentDim !== newDim) {
      // Show warning before confirming
      setPendingModel(value);
    } else {
      setPendingModel(null);
      onModelChange(value);
    }
  };

  const confirmChange = () => {
    if (pendingModel) {
      onModelChange(pendingModel);
      setPendingModel(null);
    }
  };

  const cancelChange = () => {
    setPendingModel(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <CardTitle>{title}</CardTitle>
          {saving && (
            <RefreshCw className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {saveSuccess && (
            <Badge variant="success" className="ml-auto gap-1">
              <Check className="h-3 w-3" />
              Saved
            </Badge>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <Select value={providerValue} disabled>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ollama">Ollama</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Currently only Ollama is supported as embedding provider.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Embedding Model</label>
          <Select value={modelValue} onValueChange={handleSelect}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {embeddingModels.map((m) => (
                <SelectItem key={m.model_name} value={m.model_name}>
                  <div className="flex items-center gap-2">
                    <span>{m.display_name}</span>
                    {MODEL_DIMENSIONS[m.model_name] && (
                      <span className="text-xs text-muted-foreground">
                        ({MODEL_DIMENSIONS[m.model_name]}d)
                      </span>
                    )}
                    {m.pull_status === "ready" && (
                      <Badge variant="success" className="ml-1 text-[10px] px-1 py-0">
                        Pulled
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentDim && (
            <p className="text-xs text-muted-foreground">
              Vector dimension: {currentDim}
            </p>
          )}
        </div>

        {dimensionMismatch && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm text-destructive">
                <p className="font-medium">Dimension mismatch</p>
                <p>
                  Changing from{" "}
                  <strong>{modelValue}</strong> ({currentDim}d) to{" "}
                  <strong>{pendingModel}</strong> ({pendingDim}d) will invalidate
                  all existing vectors in this pipeline. Existing search will not
                  work until all data is re-indexed.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelChange}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmChange}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Change anyway
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EmbeddingsTab() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [embeddingModels, setEmbeddingModels] = useState<CatalogModel[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [settingsData, catalogData] = await Promise.all([
          api.get<LocalSettings>("/internal/settings"),
          api.get<{ models: CatalogModel[] }>("/models/catalog?page_size=500"),
        ]);
        setSettings(settingsData);

        // Filter to embedding-capable models only
        const embedding = catalogData.models.filter(
          (m) => m.capabilities?.embedding,
        );
        setEmbeddingModels(embedding);
      } catch {
        setSaveError("Failed to load settings");
      }
      setLoading(false);
    })();
  }, []);

  const updateSetting = async (
    key: "knowledge_embedding_model",
    value: string,
  ) => {
    if (!settings) return;

    const pipeline = "knowledge";
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    setSaving(pipeline);
    setSaveError(null);

    try {
      const data = await api.patch<LocalSettings>("/internal/settings", {
        [key]: value,
      });
      setSettings(data);
      setSaveSuccess(pipeline);
      setTimeout(() => setSaveSuccess(null), 2000);
    } catch {
      setSettings(settings);
      setSaveError(`Failed to update ${pipeline} embedding model`);
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
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configure which embedding model is used for the knowledge (RAG) pipeline.
      </p>

      {saveError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <div className="max-w-md">
        <PipelineCard
          title="Knowledge"
          description="RAG document chunks and knowledge search queries"
          icon={BookOpen}
          providerValue={settings?.knowledge_embedding_provider || "ollama"}
          modelValue={settings?.knowledge_embedding_model || "nomic-embed-text"}
          embeddingModels={embeddingModels}
          onModelChange={(model) => updateSetting("knowledge_embedding_model", model)}
          saving={saving === "knowledge"}
          saveSuccess={saveSuccess === "knowledge"}
        />
      </div>
    </div>
  );
}
