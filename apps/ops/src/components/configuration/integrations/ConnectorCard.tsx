"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, Badge } from "@modularmind/ui";
import { resolveIcon } from "./icons";
import { ActiveConnectionList } from "./ActiveConnectionList";
import { ConnectionForm } from "./ConnectionForm";
import type { ConnectorCardProps } from "./types";

export function ConnectorCard({
  typeDef,
  typeConnectors,
  isExpanded,
  onToggleExpand,
  agents,
  graphs,
  models,
  copiedId,
  onCopy,
  onToggle,
  onDelete,
  formData,
  onUpdateField,
  visibleSecrets,
  onToggleSecret,
  executionMode,
  onExecutionModeChange,
  selectedTargetId,
  onTargetChange,
  connectorName,
  onConnectorNameChange,
  creating,
  onConnect,
}: ConnectorCardProps) {
  const Icon = resolveIcon(typeDef.icon);
  const hasConnectors = typeConnectors.length > 0;

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full text-left"
        onClick={onToggleExpand}
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
          <ActiveConnectionList
            connectors={typeConnectors}
            agents={agents}
            graphs={graphs}
            models={models}
            copiedId={copiedId}
            onCopy={onCopy}
            onToggle={onToggle}
            onDelete={onDelete}
          />

          <ConnectionForm
            typeDef={typeDef}
            hasConnectors={hasConnectors}
            formData={formData}
            onUpdateField={onUpdateField}
            visibleSecrets={visibleSecrets}
            onToggleSecret={onToggleSecret}
            executionMode={executionMode}
            onExecutionModeChange={onExecutionModeChange}
            selectedTargetId={selectedTargetId}
            onTargetChange={onTargetChange}
            connectorName={connectorName}
            onConnectorNameChange={onConnectorNameChange}
            creating={creating}
            onConnect={onConnect}
            agents={agents}
            graphs={graphs}
            models={models}
          />
        </div>
      )}
    </Card>
  );
}
