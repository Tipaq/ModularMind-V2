import { useEffect, useCallback, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Copy, Trash2, Bot, RefreshCw, Save, X, Pencil } from "lucide-react";
import { Badge, Button } from "@modularmind/ui";
import type { AgentUpdateInput } from "@modularmind/api-client";
import { useAgentsStore } from "../stores/agents";
import { AgentOverviewSection } from "../components/agents/AgentOverviewSection";
import { AgentToolsSection } from "../components/agents/AgentToolsSection";
import { AgentPromptSection } from "../components/agents/AgentPromptSection";

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingChanges = useRef<AgentUpdateInput>({});

  const {
    selectedAgent: agent,
    loading,
    fetchAgent,
    updateAgent,
    deleteAgent,
    duplicateAgent,
  } = useAgentsStore();

  useEffect(() => {
    if (id) fetchAgent(id);
  }, [id, fetchAgent]);

  const handleChange = useCallback((data: AgentUpdateInput) => {
    pendingChanges.current = { ...pendingChanges.current, ...data };
  }, []);

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateAgent(id, pendingChanges.current);
      pendingChanges.current = {};
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }, [id, updateAgent]);

  const handleCancel = useCallback(() => {
    pendingChanges.current = {};
    setIsEditing(false);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!agent || !confirm(`Delete "${agent.name}"?`)) return;
    await deleteAgent(agent.id);
    navigate("/agents");
  }, [agent, deleteAgent, navigate]);

  const handleDuplicate = useCallback(async () => {
    if (!agent) return;
    await duplicateAgent(agent.id);
    navigate("/agents");
  }, [agent, duplicateAgent, navigate]);

  if (loading || !agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/agents"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Agents
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight">{agent.name}</h1>
                <p className="text-xs text-muted-foreground leading-tight">
                  {agent.description || "No description"}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] ml-1">
              v{agent.version}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                  <X className="h-4 w-4 mr-1.5" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-1.5" />
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDuplicate}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-6 px-6 space-y-6">
          <AgentOverviewSection agent={agent} isEditing={isEditing} onChange={handleChange} />
          <AgentPromptSection agent={agent} isEditing={isEditing} onChange={handleChange} />
          <AgentToolsSection agent={agent} isEditing={isEditing} onChange={handleChange} />
        </div>
      </div>
    </div>
  );
}
