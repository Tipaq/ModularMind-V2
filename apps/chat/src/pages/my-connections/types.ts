import type { ConnectorData, ConnectorTypeDef } from "@modularmind/api-client";

export interface OAuthProvider {
  provider_id: string;
  name: string;
  configured: boolean;
}

export interface MyConnectionsProps {
  projectId?: string;
}

export interface ConnectorListProps {
  connectors: ConnectorData[];
  onToggle: (connector: ConnectorData) => void;
  onDelete: (connectorId: string) => void;
  projectId?: string;
}

export interface OAuthProviderListProps {
  providers: OAuthProvider[];
  typeError: Record<string, string>;
  onConnect: (providerId: string) => void;
}

export interface ConnectorTypeFormProps {
  connectorTypes: ConnectorTypeDef[];
  expandedType: string | null;
  formData: Record<string, Record<string, string>>;
  connectorName: Record<string, string>;
  creating: string | null;
  visibleSecrets: Set<string>;
  typeError: Record<string, string>;
  hasOAuthProviders: boolean;
  onToggleExpand: (typeId: string) => void;
  onUpdateField: (typeId: string, key: string, value: string) => void;
  onUpdateName: (typeId: string, name: string) => void;
  onToggleSecretVisibility: (secretKey: string) => void;
  onConnect: (typeDef: ConnectorTypeDef) => void;
  onClearError: (typeId: string) => void;
}
