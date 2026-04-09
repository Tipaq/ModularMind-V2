"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@modularmind/ui";
import type {
  ConnectorData,
  ConnectorTypeDef,
  ConnectorCredentialData,
  Agent,
  GraphListItem,
  EngineModel,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { ConnectorCard } from "./integrations/ConnectorCard";
import { EXECUTION_MODE_LABELS } from "./integrations/types";
import type { ExecutionMode } from "./integrations/types";

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
          api.get<{ items: ConnectorData[]; total: number }>("/connectors/mine"),
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
      const secretFields = typeDef.fields.filter((f) => f.is_secret);
      const nonSecretFields = typeDef.fields.filter((f) => !f.is_secret);

      const config: Record<string, string> = {};
      for (const f of nonSecretFields) {
        if (fields[f.key]) config[f.key] = fields[f.key];
      }
      if (mode === "model" && targetId) config.model_id = targetId;

      const payload: Record<string, unknown> = {
        name,
        connector_type: typeDef.type_id,
        supervisor_mode: mode === "supervisor",
        config,
      };

      if (mode === "agent") payload.agent_id = targetId;
      else if (mode === "graph") payload.graph_id = targetId;

      const data = await api.post<ConnectorData>("/connectors/global", payload);

      const secretValues: Record<string, string> = {};
      for (const f of secretFields) {
        if (fields[f.key]) secretValues[f.key] = fields[f.key];
      }

      if (Object.keys(secretValues).length > 0) {
        const credentialValue = Object.entries(secretValues)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join("|");

        await api.post<ConnectorCredentialData>(
          `/connectors/${data.id}/credentials`,
          {
            credential_type: "bot_token",
            label: `${typeDef.name} credentials`,
            value: credentialValue,
          },
        );
      }

      const refreshed = await api.get<ConnectorData>(`/connectors/${data.id}`);
      setConnectors((prev) => [refreshed, ...prev]);
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

  return (
    <div className="space-y-4">
      {connectorTypes.map((typeDef) => (
        <ConnectorCard
          key={typeDef.type_id}
          typeDef={typeDef}
          typeConnectors={connectors.filter((c) => c.connector_type === typeDef.type_id)}
          isExpanded={expandedType === typeDef.type_id}
          onToggleExpand={() =>
            setExpandedType(expandedType === typeDef.type_id ? null : typeDef.type_id)
          }
          agents={agents}
          graphs={graphs}
          models={models}
          copiedId={copiedId}
          onCopy={handleCopy}
          onToggle={handleToggle}
          onDelete={(id) => setDeleteTarget(id)}
          formData={formData[typeDef.type_id] || {}}
          onUpdateField={(key, value) => updateField(typeDef.type_id, key, value)}
          visibleSecrets={visibleSecrets}
          onToggleSecret={toggleSecret}
          executionMode={executionMode[typeDef.type_id] || "agent"}
          onExecutionModeChange={(mode) => {
            setExecutionMode((prev) => ({ ...prev, [typeDef.type_id]: mode }));
            setSelectedTargetId((prev) => ({ ...prev, [typeDef.type_id]: "" }));
          }}
          selectedTargetId={selectedTargetId[typeDef.type_id] || ""}
          onTargetChange={(id) =>
            setSelectedTargetId((prev) => ({ ...prev, [typeDef.type_id]: id }))
          }
          connectorName={connectorName[typeDef.type_id] || ""}
          onConnectorNameChange={(name) =>
            setConnectorName((prev) => ({ ...prev, [typeDef.type_id]: name }))
          }
          creating={creating === typeDef.type_id}
          onConnect={() => handleConnect(typeDef)}
        />
      ))}

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
