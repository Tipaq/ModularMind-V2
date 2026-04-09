import type {
  ConnectorData,
  ConnectorTypeDef,
  Agent,
  GraphListItem,
  EngineModel,
} from "@modularmind/api-client";

export type ExecutionMode = "agent" | "graph" | "supervisor" | "model";

export const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  agent: "Agent",
  graph: "Graph",
  supervisor: "Supervisor",
  model: "Direct LLM",
};

export interface ConnectorCardProps {
  typeDef: ConnectorTypeDef;
  typeConnectors: ConnectorData[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  agents: Agent[];
  graphs: GraphListItem[];
  models: EngineModel[];
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onToggle: (connector: ConnectorData) => void;
  onDelete: (connectorId: string) => void;
  formData: Record<string, string>;
  onUpdateField: (key: string, value: string) => void;
  visibleSecrets: Set<string>;
  onToggleSecret: (fieldKey: string) => void;
  executionMode: ExecutionMode;
  onExecutionModeChange: (mode: ExecutionMode) => void;
  selectedTargetId: string;
  onTargetChange: (targetId: string) => void;
  connectorName: string;
  onConnectorNameChange: (name: string) => void;
  creating: boolean;
  onConnect: () => void;
}

export interface ActiveConnectionListProps {
  connectors: ConnectorData[];
  agents: Agent[];
  graphs: GraphListItem[];
  models: EngineModel[];
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onToggle: (connector: ConnectorData) => void;
  onDelete: (connectorId: string) => void;
}

export interface ConnectionFormProps {
  typeDef: ConnectorTypeDef;
  hasConnectors: boolean;
  formData: Record<string, string>;
  onUpdateField: (key: string, value: string) => void;
  visibleSecrets: Set<string>;
  onToggleSecret: (fieldKey: string) => void;
  executionMode: ExecutionMode;
  onExecutionModeChange: (mode: ExecutionMode) => void;
  selectedTargetId: string;
  onTargetChange: (targetId: string) => void;
  connectorName: string;
  onConnectorNameChange: (name: string) => void;
  creating: boolean;
  onConnect: () => void;
  agents: Agent[];
  graphs: GraphListItem[];
  models: EngineModel[];
}
