import { useState, useEffect } from "react";
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
import type { Graph } from "@modularmind/api-client";
import { useGraphsStore } from "../../stores/graphs";

interface CreateGraphDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (graph: Graph) => void;
}

interface GraphForm {
  name: string;
  description: string;
}

const INITIAL_FORM: GraphForm = {
  name: "",
  description: "",
};

function CreateGraphDialog({ isOpen, onOpenChange, onCreated }: CreateGraphDialogProps) {
  const { createGraph } = useGraphsStore();
  const [form, setForm] = useState<GraphForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(INITIAL_FORM);
  }, [isOpen]);

  const updateForm = (partial: Partial<GraphForm>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const graph = await createGraph({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      onOpenChange(false);
      onCreated(graph);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Graph</DialogTitle>
          <DialogDescription>Create a new workflow graph. Add nodes and edges in the editor.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <Input
            label="Graph name"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            placeholder="e.g., Customer Support Pipeline"
            required
          />
          <Textarea
            value={form.description}
            onChange={(e) => updateForm({ description: e.target.value })}
            placeholder="Describe what this graph does..."
            rows={3}
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !form.name.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CreateGraphDialog };
