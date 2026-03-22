import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Textarea,
} from "@modularmind/ui";
import type { AgentDetail } from "@modularmind/api-client";
import { useAgentsStore } from "../../stores/agents";

interface CreateAgentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (agent: AgentDetail) => void;
}

interface AgentForm {
  name: string;
  description: string;
  modelId: string;
}

const INITIAL_FORM: AgentForm = {
  name: "",
  description: "",
  modelId: "",
};

function CreateAgentDialog({ isOpen, onOpenChange, onCreated }: CreateAgentDialogProps) {
  const { createAgent } = useAgentsStore();
  const [form, setForm] = useState<AgentForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);

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
      });
      handleOpenChange(false);
      onCreated(agent);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
          <DialogDescription>Create a new AI agent with a model.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            placeholder="e.g., Code Reviewer"
            required
          />
          <Textarea
            value={form.description}
            onChange={(e) => updateForm({ description: e.target.value })}
            placeholder="What does this agent do?"
            rows={2}
          />
          <Input
            label="Model ID"
            value={form.modelId}
            onChange={(e) => updateForm({ modelId: e.target.value })}
            placeholder="ollama:llama3.2"
            required
          />

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
