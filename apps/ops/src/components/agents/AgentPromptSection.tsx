import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Textarea } from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";

interface AgentPromptSectionProps {
  agent: AgentDetail;
  isEditing: boolean;
  onChange: (data: AgentUpdateInput) => void;
}

export function AgentPromptSection({ agent, isEditing, onChange }: AgentPromptSectionProps) {
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || "");

  useEffect(() => {
    if (!isEditing) {
      setSystemPrompt(agent.system_prompt || "");
    }
  }, [isEditing, agent]);

  const handleChange = (value: string) => {
    setSystemPrompt(value);
    onChange({ system_prompt: value });
  };

  const displayPrompt = isEditing ? systemPrompt : agent.system_prompt || "";

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          System Prompt
        </div>
        <span className="text-xs text-muted-foreground">{displayPrompt.length} characters</span>
      </div>

      {isEditing ? (
        <Textarea
          value={systemPrompt}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Enter the system prompt for this agent..."
          className="min-h-[200px] font-mono text-sm resize-y"
        />
      ) : (
        <div className="rounded-md border bg-muted/30 p-4 min-h-[200px]">
          {agent.system_prompt ? (
            <pre className="text-sm whitespace-pre-wrap font-mono">{agent.system_prompt}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">No system prompt configured</p>
          )}
        </div>
      )}
    </div>
  );
}
