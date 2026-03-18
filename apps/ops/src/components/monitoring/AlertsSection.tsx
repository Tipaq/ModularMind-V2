"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { AlertItem } from "@modularmind/api-client";

interface AlertsSectionProps {
  alerts: AlertItem[];
}

export function AlertsSection({ alerts }: AlertsSectionProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const isCritical = alert.severity === "critical";
        return (
          <div
            key={alert.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3",
              isCritical
                ? "bg-destructive/10 border border-destructive/20"
                : "bg-warning/10 border border-warning/20",
            )}
          >
            {isCritical ? (
              <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            )}
            <span
              className={cn(
                "flex-1 text-sm",
                isCritical ? "text-destructive" : "text-warning",
              )}
            >
              <span className="font-semibold">{isCritical ? "Critical" : "Warning"}:</span>{" "}
              {alert.message}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {new Date(alert.triggered_at).toLocaleTimeString("en-US", { hour12: false })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
