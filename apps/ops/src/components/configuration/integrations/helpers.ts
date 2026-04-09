import type {
  ConnectorData,
  Agent,
  GraphListItem,
  EngineModel,
} from "@modularmind/api-client";

export function getConnectorExecutionLabel(connector: ConnectorData): string {
  if (connector.supervisor_mode) return "Supervisor";
  if (connector.graph_id) return "Graph";
  if (connector.agent_id) return "Agent";
  if (connector.config?.model_id) return "LLM";
  return "—";
}

export function getConnectorTargetName(
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

export function buildWebhookUrl(connectorId: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/api/v1/webhooks/${connectorId}`;
}
