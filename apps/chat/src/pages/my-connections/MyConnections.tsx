"use client";

import { RefreshCw } from "lucide-react";
import { Badge, ConfirmDialog } from "@modularmind/ui";
import type { MyConnectionsProps } from "./types";
import { useMyConnections } from "./useMyConnections";
import { ConnectorList } from "./ConnectorList";
import { OAuthProviderList } from "./OAuthProviderList";
import { ConnectorTypeForm } from "./ConnectorTypeForm";

export function MyConnections({ projectId }: MyConnectionsProps) {
  const {
    connectorTypes,
    connectors,
    configuredOAuthProviders,
    loading,
    expandedType,
    formData,
    connectorName,
    creating,
    deleteTarget,
    deleting,
    visibleSecrets,
    typeError,
    setExpandedType,
    updateField,
    updateName,
    handleConnect,
    handleOAuthConnect,
    handleToggle,
    handleDeleteConfirm,
    setDeleteTarget,
    toggleSecretVisibility,
    clearError,
  } = useMyConnections(projectId);

  const scopeLabel = projectId ? "project" : "personal";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            {projectId ? "Project Connectors" : "My Connections"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {projectId
              ? "Connect external services to this project"
              : "Connect your personal services to ModularMind"}
          </p>
        </div>
        <Badge variant="outline">
          {connectors.length} {scopeLabel}
        </Badge>
      </div>

      <ConnectorList
        connectors={connectors}
        onToggle={handleToggle}
        onDelete={setDeleteTarget}
        projectId={projectId}
      />

      <OAuthProviderList
        providers={configuredOAuthProviders}
        typeError={typeError}
        onConnect={handleOAuthConnect}
      />

      <ConnectorTypeForm
        connectorTypes={connectorTypes}
        expandedType={expandedType}
        formData={formData}
        connectorName={connectorName}
        creating={creating}
        visibleSecrets={visibleSecrets}
        typeError={typeError}
        hasOAuthProviders={configuredOAuthProviders.length > 0}
        onToggleExpand={(typeId) =>
          setExpandedType(expandedType === typeId ? null : typeId)
        }
        onUpdateField={updateField}
        onUpdateName={updateName}
        onToggleSecretVisibility={toggleSecretVisibility}
        onConnect={handleConnect}
        onClearError={clearError}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Remove connection?"
        description="This will disconnect this service. You can reconnect it later."
        confirmLabel="Remove"
        destructive
        loading={deleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
