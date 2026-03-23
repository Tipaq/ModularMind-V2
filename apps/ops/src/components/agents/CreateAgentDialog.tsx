import { useState, useEffect } from "react";
import { Brain, Clock } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleRow,
  formatModelName,
} from "@modularmind/ui";
import type { AgentDetail } from "@modularmind/api-client";
import { useAgentsStore } from "../../stores/agents";
import { useModelsStore } from "../../stores/models";

interface CreateAgentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (agent: AgentDetail) => void;
}

interface AgentForm {
  name: string;
  description: string;
  modelId: string;
  systemPrompt: string;
  memoryEnabled: boolean;
  timeoutEnabled: boolean;
  timeoutSeconds: number;
}

const INITIAL_FORM: AgentForm = {
  name: "",
  description: "",
  modelId: "",
  systemPrompt: "",
  memoryEnabled: false,
  timeoutEnabled: false,
  timeoutSeconds: 120,
};

function CreateAgentDialog({ isOpen, onOpenChange, onCreated }: CreateAgentDialogProps) {
  const { createAgent } = useAgentsStore();
  const { unifiedCatalog, fetchUnifiedCatalog } = useModelsStore();
  const [form, setForm] = useState<AgentForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen && unifiedCatalog.length === 0) fetchUnifiedCatalog();
  }, [isOpen, unifiedCatalog.length, fetchUnifiedCatalog]);

  const readyModels = unifiedCatalog.filter((m) => m.unifiedStatus === "ready");

  const updateForm = (partial: Partial<AgentForm>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const handleOpenChange = (open: boolean) => {
    if (!open) setForm(INITIAL_FORM);
    onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.modelId.trim()) return;
    setCreating(true);
    try {
      const agent = await createAgent({
        name: form.name.trim(),
        description: form.description.trim(),
        model_id: form.modelId.trim(),
        system_prompt: form.systemPrompt.trim() || undefined,
        memory_enabled: form.memoryEnabled,
        timeout_seconds: form.timeoutEnabled ? form.timeoutSeconds : 0,
      });
      handleOpenChange(false);
      onCreated(agent);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
          <DialogDescription>Create a new AI agent with a model.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder="e.g., Code Reviewer"
              required
            />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Model</label>
              <Select value={form.modelId} onValueChange={(v) => updateForm({ modelId: v })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {readyModels.map((m) => {
                    const modelId = `${m.provider}:${m.model_name}`;
                    return (
                      <SelectItem key={modelId} value={modelId}>
                        <div className="flex items-center gap-2">
                          <span>{formatModelName(modelId)}</span>
                          <span className="text-[10px] text-muted-foreground">{m.provider}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Textarea
            value={form.description}
            onChange={(e) => updateForm({ description: e.target.value })}
            placeholder="What does this agent do?"
            rows={2}
          />

          <div className="grid grid-cols-2 gap-4">
            <ToggleRow
              icon={Clock}
              label="Timeout"
              checked={form.timeoutEnabled}
              onCheckedChange={(checked) => updateForm({ timeoutEnabled: checked })}
            >
              {form.timeoutEnabled && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Input
                    type="number"
                    value={form.timeoutSeconds}
                    onChange={(e) => updateForm({ timeoutSeconds: Number(e.target.value) })}
                    className="w-16 h-7 text-xs"
                    min={10}
                    max={600}
                  />
                  <span className="text-[10px] text-muted-foreground">sec</span>
                </div>
              )}
            </ToggleRow>
            <ToggleRow
              icon={Brain}
              label="Memory"
              checked={form.memoryEnabled}
              onCheckedChange={(checked) => updateForm({ memoryEnabled: checked })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              System Prompt
              <span className="text-muted-foreground/50 ml-1">(optional)</span>
            </label>
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => updateForm({ systemPrompt: e.target.value })}
              placeholder="Define how this agent should behave..."
              className="min-h-[80px] font-mono text-[13px] leading-relaxed resize-y"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={creating || !form.name.trim() || !form.modelId.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CreateAgentDialog };
