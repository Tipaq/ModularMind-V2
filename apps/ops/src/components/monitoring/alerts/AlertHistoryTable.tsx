"use client";

import { useEffect, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { AlertHistoryResponse, AlertItem } from "@modularmind/api-client";
import { api } from "../../../lib/api";

function formatAlertTime(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function AlertHistoryTable() {
  const [data, setData] = useState<AlertHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const result = await api.get<AlertHistoryResponse>("/alerts/history");
      setData(result);
    } catch {
      // silently fail — endpoint may not be available
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        Loading alert history...
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        No alert history available.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Alert History ({data.total})
        </h3>
        <button
          onClick={fetchHistory}
          className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Severity</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Metric</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Message</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Value</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Threshold</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Time</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((alert: AlertItem) => (
              <tr key={alert.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                      alert.severity === "critical"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning",
                    )}
                  >
                    {alert.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                  {alert.metric}
                </td>
                <td className="px-4 py-3 text-xs max-w-[300px] truncate">
                  {alert.message}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums font-medium">
                  {alert.actual.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                  {alert.threshold.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                  {formatAlertTime(alert.triggered_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
