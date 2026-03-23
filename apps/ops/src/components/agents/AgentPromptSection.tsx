import { useEffect, useState } from "react";
import { FileText, MessageSquare } from "lucide-react";
import { CopyButton, Textarea } from "@modularmind/ui";
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

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          System Prompt
        </div>
        {displayPrompt.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground tabular-nums">
            <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
            <span className="opacity-30">/</span>
            <span>{displayPrompt.length.toLocaleString()} chars</span>
          </div>
        )}
      </div>

      {isEditing ? (
        <Textarea
          value={systemPrompt}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Define how this agent should behave, its personality, constraints, and goals..."
          className="min-h-[200px] font-mono text-[13px] leading-relaxed resize-y border-border/50 bg-background"
        />
      ) : agent.system_prompt ? (
        <div className="group relative rounded-lg bg-muted/30 overflow-hidden">
          <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <CopyButton content={agent.system_prompt} />
          </div>
          <div className="overflow-y-auto max-h-[320px] p-4 pr-10">
            <pre className="text-[13px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/85">
              {agent.system_prompt}
            </pre>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-muted/20 border border-dashed border-border/50 p-8 flex flex-col items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No system prompt configured</p>
        </div>
      )}
    </div>
  );
}
