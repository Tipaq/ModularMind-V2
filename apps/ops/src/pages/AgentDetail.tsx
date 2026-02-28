import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Bot,
  Copy,
  Edit,
  RefreshCw,
  Save,
  Shield,
  SlidersHorizontal,
  Trash2,
  X,
  Brain,
  Database,
} from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Separator,
  Slider,
  Switch,
  stripProvider,
  isLocalModel,
} from "@modularmind/ui";
import type { Agent, RuntimeAgentDetail } from "@modularmind/api-client";
import { DetailHeader } from "../components/shared/DetailHeader";
import { useAgentsStore } from "../stores/agents";
import { api } from "../lib/api";

// ---------------------------------------------------------------------------
// Section component for consistent styling
// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property Row
// ---------------------------------------------------------------------------

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AgentDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const agentId = params.id as string;

  // Runtime agent data
  const [runtimeAgent, setRuntimeAgent] = useState<RuntimeAgentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Platform agent data (for editing)
  const {
    selectedAgent: platformAgent,
    loading: storeLoading,
    fetchAgent,
    updateAgent,
    deleteAgent,
    duplicateAgent,
  } = useAgentsStore();

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    name: "",
    description: "",
    system_prompt: "",
    model_id: "",
    timeout_seconds: 120,
    memory_enabled: false,
    rag_enabled: false,
    rag_retrieval_count: 5,
    rag_similarity_threshold: 0.7,
  });
  const [saving, setSaving] = useState(false);

  // Load runtime agent
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await api.get<RuntimeAgentDetail>(`/agents/${agentId}`);
        setRuntimeAgent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load agent");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [agentId]);

  // Load platform agent (for editing)
  useEffect(() => {
    fetchAgent(agentId);
  }, [agentId, fetchAgent]);

  // Resolved agent — runtime data takes priority, fallback to platform agent
  const agent: RuntimeAgentDetail | null =
    runtimeAgent ||
    (platformAgent
      ? {
          id: platformAgent.id,
          name: platformAgent.name,
          description: platformAgent.description,
          model_id: platformAgent.model_id,
          version: platformAgent.version,
          is_template: platformAgent.is_template,
          created_at: platformAgent.created_at,
          updated_at: platformAgent.updated_at,
          system_prompt: platformAgent.system_prompt || "",
          memory_enabled:
            (platformAgent.config_overrides?.memory_enabled as boolean) ?? false,
          timeout_seconds:
            (platformAgent.config_overrides?.timeout_seconds as number) ?? 120,
          rag_enabled:
            (platformAgent.config_overrides?.rag_enabled as boolean) ?? false,
          rag_collection_ids:
            (platformAgent.config_overrides?.rag_collection_ids as string[]) ?? [],
          rag_retrieval_count:
            (platformAgent.config_overrides?.rag_retrieval_count as number) ?? 5,
          rag_similarity_threshold:
            (platformAgent.config_overrides?.rag_similarity_threshold as number) ??
            0.7,
          config_version: null,
          config_hash: null,
        }
      : null);

  const startEditing = () => {
    if (!agent) return;
    setEditValues({
      name: agent.name,
      description: agent.description || "",
      system_prompt: agent.system_prompt,
      model_id: agent.model_id,
      timeout_seconds: agent.timeout_seconds,
      memory_enabled: agent.memory_enabled,
      rag_enabled: agent.rag_enabled,
      rag_retrieval_count: agent.rag_retrieval_count || 5,
      rag_similarity_threshold: agent.rag_similarity_threshold || 0.7,
    });
    setIsEditing(true);
  };

  const cancelEditing = () => setIsEditing(false);

  const handleSave = async () => {
    if (!platformAgent) return;
    setSaving(true);
    try {
      await updateAgent(agentId, {
        name: editValues.name,
        description: editValues.description || null,
        system_prompt: editValues.system_prompt,
        model_id: editValues.model_id,
        version: platformAgent.version,
        config_overrides: {
          ...platformAgent.config_overrides,
          memory_enabled: editValues.memory_enabled,
          rag_enabled: editValues.rag_enabled,
          rag_retrieval_count: editValues.rag_retrieval_count,
          rag_similarity_threshold: editValues.rag_similarity_threshold,
          timeout_seconds: editValues.timeout_seconds,
        },
      });
      setIsEditing(false);
      // Refresh runtime data
      try {
        const data = await api.get<RuntimeAgentDetail>(`/agents/${agentId}`);
        setRuntimeAgent(data);
      } catch {
        // Ignore refresh error
      }
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${agent?.name}"?`)) return;
    try {
      await deleteAgent(agentId);
      navigate("/agents");
    } catch {
      // Error handled in store
    }
  };

  const handleDuplicate = async () => {
    try {
      await duplicateAgent(agentId);
      navigate("/agents");
    } catch {
      // Error handled in store
    }
  };

  const stillLoading = isLoading || (!runtimeAgent && storeLoading);

  if (stillLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="space-y-4 p-6">
        <nav>
          <Link
            to="/agents"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Bot className="h-4 w-4" />
            Agents
          </Link>
        </nav>
        <div className="rounded-lg border bg-card p-12 text-center">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Agent not found</h3>
          <p className="mt-2 text-sm text-destructive">
            {error || "Agent does not exist"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Full-width header */}
      <DetailHeader
        backHref="/agents"
        backLabel="Agents"
        title={isEditing ? editValues.name : agent.name}
        isEditing={isEditing}
        onEditTitle={(v) =>
          setEditValues((prev) => ({ ...prev, name: v }))
        }
        badges={
          <>
            <Badge variant="outline" className="font-mono text-xs">
              v{agent.version}
            </Badge>
            {agent.is_template && (
              <Badge variant="secondary" className="text-xs">
                Template
              </Badge>
            )}
          </>
        }
        actions={
          isEditing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEditing}
                disabled={saving}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={startEditing}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={handleDuplicate}>
                <Copy className="h-4 w-4 mr-1" />
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </>
          )
        }
      />

      {/* Content: Left properties + Right playground */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Left Panel */}
        <div className="w-full lg:w-[380px] overflow-y-auto lg:border-r border-border p-5 space-y-5">
          {/* Description */}
          <div>
            {isEditing ? (
              <textarea
                value={editValues.description}
                onChange={(e) =>
                  setEditValues((v) => ({ ...v, description: e.target.value }))
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[100px] placeholder:text-muted-foreground"
                rows={4}
                placeholder="Agent description..."
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {agent.description || "No description"}
              </p>
            )}
          </div>

          <Separator />

          {/* Configuration */}
          <Section icon={SlidersHorizontal} title="Configuration">
            <div className="space-y-1">
              {/* Model */}
              <PropRow label="Model">
                {isEditing ? (
                  <Input
                    value={editValues.model_id}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        model_id: e.target.value,
                      }))
                    }
                    className="w-52 h-8 text-sm"
                    placeholder="provider:model"
                  />
                ) : (
                  <span className="text-sm font-medium">
                    {stripProvider(agent.model_id)}
                  </span>
                )}
              </PropRow>

              {/* Type */}
              <PropRow label="Type">
                <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                  {isLocalModel(agent.model_id) ? "Local" : "Cloud"}
                </Badge>
              </PropRow>

              {/* Version */}
              <PropRow label="Version">
                <span className="text-sm font-mono">v{agent.version}</span>
              </PropRow>

              {/* Timeout */}
              <PropRow label="Timeout">
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={editValues.timeout_seconds}
                      onChange={(e) =>
                        setEditValues((v) => ({
                          ...v,
                          timeout_seconds: Number(e.target.value),
                        }))
                      }
                      className="w-20 h-8 text-sm"
                      min={10}
                      max={600}
                    />
                    <span className="text-xs text-muted-foreground">sec</span>
                  </div>
                ) : (
                  <span className="text-sm">{agent.timeout_seconds}s</span>
                )}
              </PropRow>
            </div>
          </Section>

          <Separator />

          {/* Memory */}
          <Section
            icon={Brain}
            title="Memory"
            actions={
              isEditing ? (
                <Switch
                  checked={editValues.memory_enabled}
                  onCheckedChange={(checked) =>
                    setEditValues((v) => ({ ...v, memory_enabled: checked }))
                  }
                />
              ) : (
                <Badge
                  variant={agent.memory_enabled ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {agent.memory_enabled ? "On" : "Off"}
                </Badge>
              )
            }
          >
            {(isEditing ? editValues.memory_enabled : agent.memory_enabled) ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Short-term and long-term memory is active. The agent retains
                context across conversations and consolidates key information.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Enable memory to let the agent remember context across
                conversations.
              </p>
            )}
          </Section>

          <Separator />

          {/* RAG */}
          <Section
            icon={Database}
            title="RAG (Knowledge Base)"
            actions={
              isEditing ? (
                <Switch
                  checked={editValues.rag_enabled}
                  onCheckedChange={(checked) =>
                    setEditValues((v) => ({ ...v, rag_enabled: checked }))
                  }
                />
              ) : (
                <Badge
                  variant={agent.rag_enabled ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {agent.rag_enabled ? "On" : "Off"}
                </Badge>
              )
            }
          >
            {isEditing && editValues.rag_enabled ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  The agent will search the knowledge base for relevant context
                  before responding.
                </p>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">
                      Retrieved chunks (Top-K)
                    </span>
                    <span className="text-xs font-mono">
                      {editValues.rag_retrieval_count}
                    </span>
                  </div>
                  <Slider
                    value={[editValues.rag_retrieval_count]}
                    onValueChange={([v]) =>
                      setEditValues((prev) => ({
                        ...prev,
                        rag_retrieval_count: v,
                      }))
                    }
                    min={1}
                    max={20}
                    step={1}
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">
                      Similarity threshold
                    </span>
                    <span className="text-xs font-mono">
                      {editValues.rag_similarity_threshold.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[editValues.rag_similarity_threshold]}
                    onValueChange={([v]) =>
                      setEditValues((prev) => ({
                        ...prev,
                        rag_similarity_threshold: v,
                      }))
                    }
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </div>
              </div>
            ) : (isEditing ? !editValues.rag_enabled : !agent.rag_enabled) ? (
              <p className="text-xs text-muted-foreground">
                Enable RAG to augment responses with your document collections.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Knowledge base search is active.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">
                      Collections
                    </p>
                    <p className="text-sm font-medium">
                      {agent.rag_collection_ids.length}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Top-K</p>
                    <p className="text-sm font-medium">
                      {agent.rag_retrieval_count}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">
                      Threshold
                    </p>
                    <p className="text-sm font-medium">
                      {agent.rag_similarity_threshold}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Separator />

          {/* System Prompt */}
          <Section icon={Shield} title="System Prompt">
            {isEditing ? (
              <textarea
                value={editValues.system_prompt}
                onChange={(e) =>
                  setEditValues((v) => ({
                    ...v,
                    system_prompt: e.target.value,
                  }))
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y min-h-[200px] placeholder:text-muted-foreground"
                rows={10}
                placeholder="Enter a system prompt..."
              />
            ) : (
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm max-h-[300px] overflow-y-auto leading-relaxed">
                {agent.system_prompt || "No system prompt configured"}
              </pre>
            )}
          </Section>
        </div>

        {/* Right Panel — Playground placeholder */}
        <div className="flex-1 min-w-0 h-full overflow-hidden flex items-center justify-center bg-muted/20">
          <div className="text-center text-muted-foreground">
            <Bot className="mx-auto h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Playground coming soon</p>
            <p className="text-xs mt-1">
              Test this agent with real-time conversations
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
