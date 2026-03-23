import { useEffect, useCallback, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Copy, Trash2, Bot, RefreshCw, Save, X, Edit } from "lucide-react";
import { Badge, Button, Separator } from "@modularmind/ui";
import type { AgentUpdateInput } from "@modularmind/api-client";
import { useAgentsStore } from "../stores/agents";
import { AgentOverviewSection } from "../components/agents/AgentOverviewSection";
import { AgentToolsSection } from "../components/agents/AgentToolsSection";
import { AgentPromptSection } from "../components/agents/AgentPromptSection";

export default function AgentDetail() {
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
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/agents"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Agents
            </Link>
            <div className="h-4 w-px bg-border" />
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">{agent.name}</h1>
            <Badge variant="outline" className="font-mono text-xs">
              v{agent.version}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleDuplicate}>
              <Copy className="h-4 w-4 mr-1" /> Duplicate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AgentOverviewSection agent={agent} isEditing={isEditing} onChange={handleChange} />
        <Separator />
        <AgentPromptSection agent={agent} isEditing={isEditing} onChange={handleChange} />
        <Separator />
        <AgentToolsSection agent={agent} isEditing={isEditing} onChange={handleChange} />
      </div>
    </div>
  );
}
