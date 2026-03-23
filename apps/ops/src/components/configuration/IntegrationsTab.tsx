"use client";

import { useEffect, useState } from "react";
import {
  Hash,
  MessageSquare,
  MessageCircle,
  Mail,
  Send,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Power,
  PowerOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  Button,
  Badge,
  ConfirmDialog,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modularmind/ui";
import type {
  ConnectorData,
  ConnectorTypeDef,
  Agent,
  GraphListItem,
  EngineModel,
} from "@modularmind/api-client";
import { api } from "../../lib/api";

// ─── Custom icons (not in lucide) ───────────────────────────────────────────

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

// ─── Icon resolver ──────────────────────────────────────────────────────────

type IconComponent = React.FC<{ className?: string }>;

const ICON_MAP: Record<string, IconComponent> = {
  discord: DiscordIcon,
  hash: Hash,
  "message-square": MessageSquare,
  "message-circle": MessageCircle,
  mail: Mail,
  send: Send,
  whatsapp: WhatsAppIcon,
};

function resolveIcon(iconName: string): IconComponent {
  return ICON_MAP[iconName] ?? MessageCircle;
}

// ─── Execution mode types ───────────────────────────────────────────────────

type ExecutionMode = "agent" | "graph" | "supervisor" | "model";

const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  agent: "Agent",
  graph: "Graph",
  supervisor: "Supervisor",
  model: "Direct LLM",
};

function getConnectorExecutionLabel(connector: ConnectorData): string {
  if (connector.supervisor_mode) return "Supervisor";
  if (connector.graph_id) return "Graph";
  if (connector.agent_id) return "Agent";
  if (connector.config?.model_id) return "LLM";
  return "—";
}

function getConnectorTargetName(
  connector: ConnectorData,
  agents: Agent[],
  graphs: GraphListItem[],
  models: EngineModel[],
): string {
  if (connector.supervisor_mode) return "Auto-routing";
  if (connector.agent_id) {
    return agents.find((a) => a.id === connector.agent_id)?.name
      ?? connector.agent_id.slice(0, 8);
  }
  if (connector.graph_id) {
    return graphs.find((g) => g.id === connector.graph_id)?.name
      ?? connector.graph_id.slice(0, 8);
  }
  if (connector.config?.model_id) {
    const model = models.find((m) => m.model_id === connector.config.model_id);
    return model?.display_name ?? connector.config.model_id;
  }
  return "—";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function IntegrationsTab() {
  const [connectorTypes, setConnectorTypes] = useState<ConnectorTypeDef[]>([]);
  const [connectors, setConnectors] = useState<ConnectorData[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [graphs, setGraphs] = useState<GraphListItem[]>([]);
  const [models, setModels] = useState<EngineModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [executionMode, setExecutionMode] = useState<Record<string, ExecutionMode>>({});
  const [selectedTargetId, setSelectedTargetId] = useState<Record<string, string>>({});
  const [connectorName, setConnectorName] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [typesRes, connRes, agentRes, graphRes, modelRes] = await Promise.all([
          api.get<{ items: ConnectorTypeDef[] }>("/connectors/types"),
          api.get<{ items: ConnectorData[] }>("/connectors"),
          api.get<{ items: Agent[] }>("/agents"),
          api.get<{ items: GraphListItem[] }>("/graphs"),
          api.get<{ items: EngineModel[] }>("/models"),
        ]);
        setConnectorTypes(typesRes.items);
        setConnectors(connRes.items);
        setAgents(agentRes.items);
        setGraphs(graphRes.items ?? []);
        setModels((modelRes.items ?? []).filter((m) => !m.is_embedding && m.is_available));
      } catch (err) {
        console.warn("[IntegrationsTab] endpoints not available:", err);
      }
      setLoading(false);
    })();
  }, []);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSecret = (fieldKey: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  };

  const updateField = (typeId: string, key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [typeId]: { ...prev[typeId], [key]: value },
    }));
  };

  const handleConnect = async (typeDef: ConnectorTypeDef) => {
    const fields = formData[typeDef.type_id] || {};
    const mode = executionMode[typeDef.type_id] || "agent";
    const targetId = selectedTargetId[typeDef.type_id];
    const name = connectorName[typeDef.type_id] || `${typeDef.name} Connector`;

    for (const f of typeDef.fields) {
      if (f.is_required && !fields[f.key]?.trim()) {
        setAlertMessage(`Please fill in: ${f.label}`);
        return;
      }
    }

    if (mode !== "supervisor" && !targetId) {
      setAlertMessage(`Please select a target ${EXECUTION_MODE_LABELS[mode]}`);
      return;
    }

    setCreating(typeDef.type_id);
    try {
      const config = { ...fields };
      const payload: Record<string, unknown> = {
        name,
        connector_type: typeDef.type_id,
        supervisor_mode: mode === "supervisor",
        config,
      };

      if (mode === "agent") payload.agent_id = targetId;
      else if (mode === "graph") payload.graph_id = targetId;
      else if (mode === "model") config.model_id = targetId;

      const data = await api.post<ConnectorData>("/connectors", payload);
      setConnectors((prev) => [data, ...prev]);
      setFormData((prev) => ({ ...prev, [typeDef.type_id]: {} }));
      setConnectorName((prev) => ({ ...prev, [typeDef.type_id]: "" }));
      setSelectedTargetId((prev) => ({ ...prev, [typeDef.type_id]: "" }));
    } catch (err) {
      setAlertMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setCreating(null);
  };

  const handleToggle = async (connector: ConnectorData) => {
    try {
      const data = await api.put<ConnectorData>(
        `/connectors/${connector.id}`,
        { is_enabled: !connector.is_enabled },
      );
      setConnectors((prev) => prev.map((c) => (c.id === connector.id ? data : c)));
    } catch (err) {
      console.error("[Integrations] toggle:", err);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/connectors/${deleteTarget}`);
      setConnectors((prev) => prev.filter((c) => c.id !== deleteTarget));
    } catch (err) {
      console.error("[Integrations] delete:", err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getTypeConnectors = (typeId: string) =>
    connectors.filter((c) => c.connector_type === typeId);

  const getWebhookUrl = (connector: ConnectorData) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/v1/webhooks/${connector.id}`;
  };

  const renderTargetSelector = (typeId: string) => {
    const mode = executionMode[typeId] || "agent";

    if (mode === "supervisor") return null;

    const targetOptions =
      mode === "agent"
        ? agents.map((a) => ({ id: a.id, label: a.name }))
        : mode === "graph"
          ? graphs.map((g) => ({ id: g.id, label: g.name }))
          : models.map((m) => ({
              id: m.model_id,
              label: m.display_name ?? m.model_id,
            }));

    return (
      <div className="space-y-1">
        <Label className="text-xs">
          {EXECUTION_MODE_LABELS[mode]} <span className="text-destructive">*</span>
        </Label>
        <Select
          value={selectedTargetId[typeId] || ""}
          onValueChange={(value) =>
            setSelectedTargetId((prev) => ({ ...prev, [typeId]: value }))
          }
        >
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder={`Select ${EXECUTION_MODE_LABELS[mode].toLowerCase()}...`} />
          </SelectTrigger>
          <SelectContent>
            {targetOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {connectorTypes.map((typeDef) => {
        const Icon = resolveIcon(typeDef.icon);
        const isExpanded = expandedType === typeDef.type_id;
        const typeConnectors = getTypeConnectors(typeDef.type_id);
        const hasConnectors = typeConnectors.length > 0;

        return (
          <Card key={typeDef.type_id} className="overflow-hidden">
            <button
              className="w-full text-left"
              onClick={() => setExpandedType(isExpanded ? null : typeDef.type_id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${typeDef.color}`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{typeDef.name}</p>
                        {hasConnectors ? (
                          <Badge variant="success">
                            {typeConnectors.length} connected
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not configured</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {typeDef.description}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </button>

            {isExpanded && (
              <div className="border-t px-4 pb-4">
                {typeConnectors.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Active connections
                    </p>
                    {typeConnectors.map((connector) => {
                      const webhookUrl = getWebhookUrl(connector);
                      return (
                        <div
                          key={connector.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">
                                {connector.name}
                              </p>
                              <Badge
                                variant={connector.is_enabled ? "success" : "secondary"}
                                className="text-[10px]"
                              >
                                {connector.is_enabled ? "Active" : "Disabled"}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                {getConnectorExecutionLabel(connector)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {getConnectorTargetName(connector, agents, graphs, models)}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[400px]">
                                {webhookUrl}
                              </code>
                              <button
                                className="text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(webhookUrl, `wh-${connector.id}`);
                                }}
                              >
                                {copiedId === `wh-${connector.id}` ? (
                                  <Check className="h-3 w-3 text-success" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-3 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggle(connector);
                              }}
                              title={connector.is_enabled ? "Disable" : "Enable"}
                            >
                              {connector.is_enabled ? (
                                <PowerOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Power className="h-4 w-4 text-success" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(connector.id);
                              }}
                              title="Disconnect"
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-dashed p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {hasConnectors ? "Add another connection" : "Setup guide"}
                    </p>
                    <a
                      href={typeDef.doc_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Documentation
                    </a>
                  </div>

                  <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                    {typeDef.setup_steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>

                  <div className="grid grid-cols-2 gap-3">
                    {typeDef.fields.map((field) => {
                      const secretKey = `${typeDef.type_id}-${field.key}`;
                      const isPassword = field.is_secret;
                      const isVisible = visibleSecrets.has(secretKey);

                      return (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs">
                            {field.label}
                            {field.is_required && (
                              <span className="text-destructive ml-0.5">*</span>
                            )}
                          </Label>
                          <div className="relative">
                            <Input
                              type={isPassword && !isVisible ? "password" : "text"}
                              placeholder={field.placeholder}
                              value={formData[typeDef.type_id]?.[field.key] || ""}
                              onChange={(e) =>
                                updateField(typeDef.type_id, field.key, e.target.value)
                              }
                              className="text-xs h-8 pr-8"
                            />
                            {isPassword && (
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => toggleSecret(secretKey)}
                              >
                                {isVisible ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-4 gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Connector Name</Label>
                      <Input
                        placeholder={`My ${typeDef.name} Bot`}
                        value={connectorName[typeDef.type_id] || ""}
                        onChange={(e) =>
                          setConnectorName((prev) => ({
                            ...prev,
                            [typeDef.type_id]: e.target.value,
                          }))
                        }
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Execution Mode</Label>
                      <Select
                        value={executionMode[typeDef.type_id] || "agent"}
                        onValueChange={(value) => {
                          setExecutionMode((prev) => ({
                            ...prev,
                            [typeDef.type_id]: value as ExecutionMode,
                          }));
                          setSelectedTargetId((prev) => ({
                            ...prev,
                            [typeDef.type_id]: "",
                          }));
                        }}
                      >
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agent">Agent</SelectItem>
                          <SelectItem value="graph">Graph</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="model">Direct LLM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {renderTargetSelector(typeDef.type_id)}
                    <Button
                      onClick={() => handleConnect(typeDef)}
                      disabled={creating === typeDef.type_id}
                      className="h-8 text-xs"
                    >
                      {creating === typeDef.type_id ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                          Connecting...
                        </>
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Disconnect connector?"
        description="Are you sure you want to disconnect this connector? This action cannot be undone."
        confirmLabel="Disconnect"
        destructive
        loading={deleting}
        onConfirm={handleDeleteConfirm}
      />

      <ConfirmDialog
        open={!!alertMessage}
        onOpenChange={(open) => { if (!open) setAlertMessage(null); }}
        title="Attention"
        description={alertMessage ?? ""}
        confirmLabel="OK"
        cancelLabel={false}
        onConfirm={() => setAlertMessage(null)}
      />
    </div>
  );
}
