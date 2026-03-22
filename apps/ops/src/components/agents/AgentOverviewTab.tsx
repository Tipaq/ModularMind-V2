import { useState } from "react";
import { Save, X, Edit, Settings2, Brain, Database } from "lucide-react";
import { Badge, Button, Input, Separator, Switch } from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";

interface AgentOverviewTabProps {
  agent: AgentDetail;
  onSave: (data: AgentUpdateInput) => Promise<void>;
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AgentOverviewTab({ agent, onSave }: AgentOverviewTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editValues, setEditValues] = useState({
    name: agent.name,
    description: agent.description,
    model_id: agent.model_id,
    timeout_seconds: agent.timeout_seconds,
    memory_enabled: agent.memory_enabled,
    rag_enabled: agent.rag_enabled,
    rag_collection_ids: agent.rag_collection_ids.join(", "),
    rag_retrieval_count: agent.rag_retrieval_count,
    rag_similarity_threshold: agent.rag_similarity_threshold,
  });

  const startEditing = () => setIsEditing(true);
  const cancelEditing = () => setIsEditing(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const collectionIds = editValues.rag_collection_ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await onSave({
        name: editValues.name,
        description: editValues.description,
        model_id: editValues.model_id,
        timeout_seconds: editValues.timeout_seconds,
        memory_enabled: editValues.memory_enabled,
        rag_config: {
          enabled: editValues.rag_enabled,
          collection_ids: collectionIds,
          retrieval_count: editValues.rag_retrieval_count,
          similarity_threshold: editValues.rag_similarity_threshold,
        },
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 space-y-5">
      <div className="flex justify-end gap-2">
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

      <Section icon={Settings2} title="General">
        {isEditing ? (
          <div className="space-y-3">
            <PropRow label="Name">
              <Input
                value={editValues.name}
                onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                className="w-60 h-8 text-sm"
              />
            </PropRow>
            <PropRow label="Description">
              <Input
                value={editValues.description}
                onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                className="w-60 h-8 text-sm"
              />
            </PropRow>
            <PropRow label="Model ID">
              <Input
                value={editValues.model_id}
                onChange={(e) => setEditValues((v) => ({ ...v, model_id: e.target.value }))}
                className="w-60 h-8 text-sm font-mono"
                placeholder="ollama:llama3.2"
              />
            </PropRow>
            <PropRow label="Timeout (s)">
              <Input
                type="number"
                value={editValues.timeout_seconds}
                onChange={(e) =>
                  setEditValues((v) => ({ ...v, timeout_seconds: Number(e.target.value) }))
                }
                className="w-24 h-8 text-sm"
                min={1}
              />
            </PropRow>
          </div>
        ) : (
          <div className="space-y-1">
            <PropRow label="Name">
              <span className="text-sm">{agent.name}</span>
            </PropRow>
            <PropRow label="Description">
              <span className="text-sm text-muted-foreground">
                {agent.description || "No description"}
              </span>
            </PropRow>
            <PropRow label="Model ID">
              <Badge variant="outline" className="font-mono text-[10px]">
                {agent.model_id}
              </Badge>
            </PropRow>
            <PropRow label="Timeout">
              <span className="text-sm">{agent.timeout_seconds}s</span>
            </PropRow>
          </div>
        )}
      </Section>

      <Separator />

      <Section icon={Brain} title="Memory">
        <PropRow label="Enabled">
          {isEditing ? (
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
          )}
        </PropRow>
      </Section>

      <Separator />

      <Section icon={Database} title="RAG">
        {isEditing ? (
          <div className="space-y-3">
            <PropRow label="Enabled">
              <Switch
                checked={editValues.rag_enabled}
                onCheckedChange={(checked) =>
                  setEditValues((v) => ({ ...v, rag_enabled: checked }))
                }
              />
            </PropRow>
            {editValues.rag_enabled && (
              <>
                <PropRow label="Collections">
                  <Input
                    value={editValues.rag_collection_ids}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, rag_collection_ids: e.target.value }))
                    }
                    className="w-60 h-8 text-xs font-mono"
                    placeholder="id1, id2"
                  />
                </PropRow>
                <PropRow label="Retrieval count">
                  <Input
                    type="number"
                    value={editValues.rag_retrieval_count}
                    onChange={(e) =>
                      setEditValues((v) => ({
                        ...v,
                        rag_retrieval_count: Number(e.target.value),
                      }))
                    }
                    className="w-20 h-8 text-sm"
                    min={1}
                    max={50}
                  />
                </PropRow>
                <PropRow label="Similarity threshold">
                  <Input
                    type="number"
                    value={editValues.rag_similarity_threshold}
                    onChange={(e) =>
                      setEditValues((v) => ({
                        ...v,
                        rag_similarity_threshold: Number(e.target.value),
                      }))
                    }
                    className="w-20 h-8 text-sm"
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </PropRow>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <PropRow label="Enabled">
              <Badge
                variant={agent.rag_enabled ? "default" : "secondary"}
                className="text-[10px]"
              >
                {agent.rag_enabled ? "On" : "Off"}
              </Badge>
            </PropRow>
            {agent.rag_enabled && (
              <>
                <PropRow label="Collections">
                  <span className="text-xs font-mono">
                    {agent.rag_collection_ids.length > 0
                      ? agent.rag_collection_ids.join(", ")
                      : "None"}
                  </span>
                </PropRow>
                <PropRow label="Retrieval count">
                  <span className="text-sm">{agent.rag_retrieval_count}</span>
                </PropRow>
                <PropRow label="Similarity">
                  <span className="text-sm">{agent.rag_similarity_threshold}</span>
                </PropRow>
              </>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
