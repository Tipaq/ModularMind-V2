import { useState } from "react";
import { Save, X, Edit, FileText } from "lucide-react";
import { Button, Textarea } from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";

interface AgentPromptTabProps {
  agent: AgentDetail;
  onSave: (data: AgentUpdateInput) => Promise<void>;
}

export function AgentPromptTab({ agent, onSave }: AgentPromptTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || "");

  const startEditing = () => setIsEditing(true);
  const cancelEditing = () => {
    setSystemPrompt(agent.system_prompt || "");
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ system_prompt: systemPrompt });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          System Prompt
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {(isEditing ? systemPrompt : agent.system_prompt || "").length} characters
          </span>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={startEditing}>
                <Edit className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
          </div>
        </div>
      </div>

      {isEditing ? (
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Enter the system prompt for this agent..."
          className="flex-1 min-h-[400px] font-mono text-sm resize-y"
        />
      ) : (
        <div className="flex-1 rounded-md border bg-muted/30 p-4 min-h-[400px]">
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
