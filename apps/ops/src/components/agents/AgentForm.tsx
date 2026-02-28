import { useState } from "react";
import { Button, Input, Textarea, Label } from "@modularmind/ui";

interface AgentFormProps {
  onSubmit: (data: { name: string; system_prompt: string; model_id: string; description?: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function AgentForm({ onSubmit, onCancel, loading }: AgentFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelId, setModelId] = useState("ollama:llama3.2");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) return;
    onSubmit({
      name: name.trim(),
      system_prompt: systemPrompt.trim(),
      model_id: modelId,
      description: description.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Agent"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent do?"
        />
      </div>

      <div className="space-y-2">
        <Label>Model</Label>
        <Input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="ollama:llama3.2"
        />
        <p className="text-xs text-muted-foreground">Format: provider:model (e.g. ollama:llama3.2)</p>
      </div>

      <div className="space-y-2">
        <Label>System Prompt</Label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant..."
          rows={6}
          required
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !name.trim() || !systemPrompt.trim()}>
          {loading ? "Creating..." : "Create Agent"}
        </Button>
      </div>
    </form>
  );
}
