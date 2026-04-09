"use client";

import {
  Check,
  Copy,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { Button, Badge } from "@modularmind/ui";
import { getConnectorExecutionLabel, getConnectorTargetName, buildWebhookUrl } from "./helpers";
import type { ActiveConnectionListProps } from "./types";

export function ActiveConnectionList({
  connectors,
  agents,
  graphs,
  models,
  copiedId,
  onCopy,
  onToggle,
  onDelete,
}: ActiveConnectionListProps) {
  if (connectors.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Active connections
      </p>
      {connectors.map((connector) => {
        const webhookUrl = buildWebhookUrl(connector.id);
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
                <Badge variant="outline" className="text-[10px]">
                  {connector.scope}
                </Badge>
                {connector.credential_count > 0 && (
                  <Badge variant="success" className="text-[10px]">
                    {connector.credential_count} credential{connector.credential_count > 1 ? "s" : ""}
                  </Badge>
                )}
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
                    onCopy(webhookUrl, `wh-${connector.id}`);
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
                  onToggle(connector);
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
                  onDelete(connector.id);
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
  );
}
