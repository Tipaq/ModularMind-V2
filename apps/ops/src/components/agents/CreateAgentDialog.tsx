import type { AgentDetail } from "@modularmind/api-client";
import { useAgentsStore } from "../../stores/agents";
import { AgentFormDialog, EMPTY_AGENT_FORM, type AgentFormValues } from "./AgentFormDialog";
import { countEnabledCategories } from "./tool-categories";

interface CreateAgentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (agent: AgentDetail) => void;
}

function CreateAgentDialog({ isOpen, onOpenChange, onCreated }: CreateAgentDialogProps) {
  const { createAgent } = useAgentsStore();

  const handleSubmit = async (values: AgentFormValues) => {
    const enabledCount = countEnabledCategories(values.toolCategories);
    const agent = await createAgent({
      name: values.name.trim(),
      description: values.description.trim(),
      model_id: values.modelId.trim(),
      system_prompt: values.systemPrompt.trim() || undefined,
      memory_enabled: values.memoryEnabled,
      timeout_seconds: values.timeoutEnabled ? values.timeoutSeconds : 0,
      tool_categories: enabledCount > 0 ? values.toolCategories : undefined,
    });
    onCreated(agent);
  };

  return (
    <AgentFormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="New Agent"
      description="Create a new AI agent with a model."
      submitLabel="Create"
      initialValues={EMPTY_AGENT_FORM}
      onSubmit={handleSubmit}
    />
  );
}

export { CreateAgentDialog };
