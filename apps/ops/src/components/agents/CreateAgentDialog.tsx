import { useState } from "react";
import { Brain, Clock, Wrench } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleRow,
  formatModelName,
} from "@modularmind/ui";
import type { AgentDetail, ToolCategories } from "@modularmind/api-client";
import { useAgentsStore } from "../../stores/agents";
import { useModelsStore } from "../../stores/models";
import { TOOL_CATEGORIES, countEnabledCategories } from "./tool-categories";
import { ToolCategoryPicker } from "./ToolCategoryPicker";

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
  toolCategories: ToolCategories;
}

const INITIAL_FORM: AgentForm = {
  name: "",
  description: "",
  modelId: "",
  systemPrompt: "",
  memoryEnabled: false,
  timeoutEnabled: false,
  timeoutSeconds: 120,
  toolCategories: {},
};

function CreateAgentDialog({ isOpen, onOpenChange, onCreated }: CreateAgentDialogProps) {
  const { createAgent } = useAgentsStore();
  const { unifiedCatalog, fetchUnifiedCatalog } = useModelsStore();
  const [form, setForm] = useState<AgentForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);

  const readyModels = unifiedCatalog.filter((m) => m.unifiedStatus === "ready");

  const updateForm = (partial: Partial<AgentForm>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const handleOpenChange = (open: boolean) => {
    if (open && unifiedCatalog.length === 0) fetchUnifiedCatalog();
    if (!open) setForm(INITIAL_FORM);
    onOpenChange(open);
  };

  const handleToolCategoriesChange = (next: ToolCategories) => {
    updateForm({ toolCategories: next });
  };

  const enabledCount = countEnabledCategories(form.toolCategories);

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
        tool_categories: enabledCount > 0 ? form.toolCategories : undefined,
      });
      handleOpenChange(false);
      onCreated(agent);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
          <DialogDescription>Create a new AI agent with a model.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-1 overflow-y-auto min-h-0">
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

          <SectionCard
            icon={Wrench}
            title="Tools"
            variant="card"
            trailing={
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {enabledCount} / {TOOL_CATEGORIES.length}
              </Badge>
            }
          >
            <div className="max-h-[240px] overflow-y-auto -mx-1 px-1">
              <ToolCategoryPicker
                categories={form.toolCategories}
                onChange={handleToolCategoriesChange}
              />
            </div>
          </SectionCard>

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
