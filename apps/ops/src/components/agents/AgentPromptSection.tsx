import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { PromptDisplay, SectionCard, Textarea } from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";

interface AgentPromptSectionProps {
  agent: AgentDetail;
  isEditing: boolean;
  onChange: (data: AgentUpdateInput) => void;
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
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
  const lineCount = countLines(displayPrompt);

  const statsTrailing = displayPrompt.length > 0 ? (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground tabular-nums">
      <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
      <span className="opacity-30">/</span>
      <span>{displayPrompt.length.toLocaleString()} chars</span>
    </div>
  ) : undefined;

  return (
    <SectionCard
      icon={MessageSquare}
      title="System Prompt"
      variant="card"
      trailing={statsTrailing}
      className="space-y-3"
    >
      {isEditing ? (
        <Textarea
          value={systemPrompt}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Define how this agent should behave, its personality, constraints, and goals..."
          className="min-h-[200px] font-mono text-[13px] leading-relaxed resize-y border-border/50 bg-background"
        />
      ) : (
        <PromptDisplay content={agent.system_prompt || null} />
      )}
    </SectionCard>
  );
}
