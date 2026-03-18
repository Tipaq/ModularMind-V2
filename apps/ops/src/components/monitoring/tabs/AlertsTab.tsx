"use client";

import type { AlertItem } from "@modularmind/api-client";
import { AlertsSection } from "../AlertsSection";
import { AlertHistoryTable } from "../alerts/AlertHistoryTable";
import { ThresholdManager } from "../alerts/ThresholdManager";

interface AlertsTabProps {
  alerts: AlertItem[];
}

export function AlertsTab({ alerts }: AlertsTabProps) {
  return (
    <div className="space-y-8">
      {/* Active Alerts */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Active Alerts</h2>
        {alerts.length > 0 ? (
          <AlertsSection alerts={alerts} />
        ) : (
          <p className="text-sm text-muted-foreground">No active alerts.</p>
        )}
      </section>

      {/* Alert History */}
      <section>
        <AlertHistoryTable />
      </section>

      {/* Threshold Configuration */}
      <section>
        <ThresholdManager />
      </section>
    </div>
  );
}
