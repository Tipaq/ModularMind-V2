/** Shared monitoring utilities — used across monitoring components. */

import { api } from "./api";

/** Retry DLQ messages. */
export async function retryDLQBatch(count: number, onRefresh: () => Promise<void>): Promise<void> {
  await api.post(`/internal/actions/dlq/retry?count=${count}`);
  await onRefresh();
}

/** Color class for stream depth indicators. */
export function dotColor(count: number): string {
  if (count > 10) return "bg-destructive";
  if (count > 0) return "bg-warning";
  return "bg-success";
}

/** Threshold-based text color for percentage values. */
export function thresholdColor(value: number, warn = 50, crit = 80): string {
  if (value >= crit) return "text-destructive";
  if (value >= warn) return "text-warning";
  return "text-success";
}

/** Threshold-based bar color for percentage values. */
export function thresholdBarColor(value: number, warn = 50, crit = 80): string {
  if (value >= crit) return "bg-destructive";
  if (value >= warn) return "bg-warning";
  return "bg-success";
}
