import { useState, useEffect } from "react";
import { Button, Input, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@modularmind/ui";
import type { Agent, AgentCreate, AgentUpdate } from "@modularmind/api-client";
import { useModelsStore } from "../../stores/models";

interface AgentFormProps {
  agent?: Agent;
  onSubmit: (data: AgentCreate | AgentUpdate) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function AgentForm({ agent, onSubmit, onCancel, loading }: AgentFormProps) {
  const isEditing = !!agent;

  const [formData, setFormData] = useState({
    name: agent?.name || "",
    description: agent?.description || "",
    system_prompt: agent?.system_prompt || "",
    model_id: agent?.model_id || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Get available models from the models store — only show accessible models
  const { catalogModels, fetchCatalog, isProviderConfigured } = useModelsStore();
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    if (catalogModels.length === 0 && !modelsLoaded) {
      fetchCatalog().finally(() => setModelsLoaded(true));
    } else {
      setModelsLoaded(true);
    }
  }, [catalogModels.length, fetchCatalog, modelsLoaded]);

  const modelOptions = catalogModels
    .filter(
      (m) =>
        (m.provider === "ollama" && m.pull_status === "ready") ||
        (m.provider !== "ollama" && isProviderConfigured(m.provider)),
    )
    .map((m) => ({
      value: m.model_name,
      label: `${m.display_name || m.model_name} (${m.provider})`,
    }));

  // Add current model_id as option if not in catalog (e.g. synced but not in platform)
  if (formData.model_id && !modelOptions.find((o) => o.value === formData.model_id)) {
    modelOptions.unshift({ value: formData.model_id, label: formData.model_id });
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.system_prompt.trim()) newErrors.system_prompt = "System prompt is required";
    if (!formData.model_id) newErrors.model_id = "Model selection is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    try {
      if (isEditing && agent) {
        const updateData: AgentUpdate = {
          name: formData.name,
          description: formData.description || null,
          system_prompt: formData.system_prompt,
          model_id: formData.model_id,
          version: agent.version,
        };
        await onSubmit(updateData);
      } else {
        const createData: AgentCreate = {
          name: formData.name,
          description: formData.description || null,
          system_prompt: formData.system_prompt,
          model_id: formData.model_id,
        };
        await onSubmit(createData);
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {apiError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {apiError}
        </div>
      )}

      <Input
        id="name"
        label="Name"
        placeholder="My Agent"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        error={errors.name}
        required
      />

      <Input
        id="description"
        label="Description"
        placeholder="A brief description of what this agent does"
        value={formData.description || ""}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
      />

      <Textarea
        id="system_prompt"
        label="System Prompt"
        placeholder="You are a helpful assistant..."
        value={formData.system_prompt}
        onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
        error={errors.system_prompt}
        rows={6}
        required
      />

      {modelOptions.length > 0 ? (
        <div className="w-full">
          <label htmlFor="model_id" className="block text-sm font-medium text-foreground mb-1.5">
            Model
          </label>
          <Select value={formData.model_id} onValueChange={(v) => setFormData({ ...formData, model_id: v })} required>
            <SelectTrigger id="model_id" className={errors.model_id ? "border-destructive" : ""}>
              <SelectValue placeholder="Select a model..." />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.model_id && <p className="mt-1.5 text-sm text-destructive">{errors.model_id}</p>}
        </div>
      ) : (
        <div>
          <Input
            id="model_id"
            label="Model ID"
            placeholder="e.g. mistral:latest, gpt-4o, claude-3-haiku"
            value={formData.model_id}
            onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
            error={errors.model_id}
            required
          />
          {!modelsLoaded && (
            <p className="mt-1 text-xs text-muted-foreground">Loading models catalog...</p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {isEditing ? "Save Changes" : "Create Agent"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
