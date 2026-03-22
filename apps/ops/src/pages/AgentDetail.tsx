import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Copy, Trash2, Bot, RefreshCw } from "lucide-react";
import { Badge, Button, cn } from "@modularmind/ui";
import type { AgentUpdateInput } from "@modularmind/api-client";
import { useAgentsStore } from "../stores/agents";
import { AgentOverviewTab } from "../components/agents/AgentOverviewTab";
import { AgentToolsTab } from "../components/agents/AgentToolsTab";
import { AgentPromptTab } from "../components/agents/AgentPromptTab";

type TabKey = "overview" | "tools" | "gateway" | "prompt";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tools", label: "Tools" },
  { key: "gateway", label: "Gateway" },
  { key: "prompt", label: "Prompt" },
];

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

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

  const handleSave = useCallback(
    async (data: AgentUpdateInput) => {
      if (!id) return;
      await updateAgent(id, data);
    },
    [id, updateAgent],
  );

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

        <div className="flex gap-6 mt-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "pb-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "overview" && (
          <AgentOverviewTab agent={agent} onSave={handleSave} />
        )}
        {activeTab === "tools" && (
          <AgentToolsTab agent={agent} onSave={handleSave} />
        )}
        {activeTab === "gateway" && (
          <div className="p-5 text-sm text-muted-foreground">
            Gateway permissions configuration coming soon.
          </div>
        )}
        {activeTab === "prompt" && (
          <AgentPromptTab agent={agent} onSave={handleSave} />
        )}
      </div>
    </div>
  );
}
