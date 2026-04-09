"use client";

import { Plug, Trash2, Power, PowerOff } from "lucide-react";
import { Badge, Button, EmptyState } from "@modularmind/ui";
import type { ConnectorListProps } from "./types";

export function ConnectorList({
  connectors,
  onToggle,
  onDelete,
  projectId,
}: ConnectorListProps) {
  if (connectors.length === 0) {
    return (
      <EmptyState
        icon={Plug}
        title={projectId ? "No project connectors" : "No connections yet"}
        description={
          projectId
            ? "Connect services like Slack or email to this project."
            : "Connect your personal services like Gmail, Slack, or custom APIs."
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="flex items-center justify-between rounded-xl border px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">
                {connector.name}
              </p>
              <Badge
                variant={connector.is_enabled ? "success" : "secondary"}
                className="text-[10px]"
              >
                {connector.is_enabled ? "Active" : "Disabled"}
              </Badge>
              {connector.credential_count > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  Credentials linked
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {connector.connector_type}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggle(connector)}
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
              onClick={() => onDelete(connector.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
